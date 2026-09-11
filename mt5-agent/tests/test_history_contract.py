import unittest
from unittest.mock import patch
import mt5_client as module
from mt5_client import MT5Client

class FakeMT5:
    TIMEFRAME_M1=1;TIMEFRAME_M5=5;TIMEFRAME_M15=15;TIMEFRAME_M30=30;TIMEFRAME_H1=60;TIMEFRAME_H4=240;TIMEFRAME_D1=1440
    def __init__(self): self.frames=[]
    def copy_rates_range(self,symbol,frame,start,end):
        self.frames.append((symbol,frame))
        return [{'time':1704067200,'open':1.0,'high':2.0,'low':.5,'close':1.5,'tick_volume':10,'spread':12,'real_volume':2}]

class HistoryContractTests(unittest.TestCase):
    def test_all_native_timeframe_mappings_and_provenance(self):
        fake=FakeMT5();client=MT5Client();client.broker='Broker';client.server='Server'
        client.check_connection=lambda:True
        client.get_symbol_info=lambda symbol:{'broker_symbol':'EURUSD.a'}
        with patch.object(module,'HAS_MT5',True),patch.object(module,'mt5',fake):
            for timeframe,expected in [('1m',1),('5m',5),('15m',15),('30m',30),('1h',60),('4h',240),('1d',1440)]:
                result=client.get_historical_bars('EURUSD',timeframe,'2024-01-01T00:00:00Z','2024-01-02T00:00:00Z')
                self.assertEqual(fake.frames[-1],('EURUSD.a',expected));self.assertEqual(result['source_symbol'],'EURUSD.a');self.assertEqual(result['bars'][0]['spread'],12)
            with self.assertRaisesRegex(ValueError,'MT5_TIMEFRAME_UNSUPPORTED'):
                client.get_historical_bars('EURUSD','2m','2024-01-01T00:00:00Z','2024-01-02T00:00:00Z')

if __name__=='__main__': unittest.main()
