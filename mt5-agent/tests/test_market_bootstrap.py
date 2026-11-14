"""History seeding stays bounded, repeatable and distinct from ongoing feed updates."""
import unittest
from unittest.mock import MagicMock,patch
from config import Config
from market_data import MarketDataPublisher,REQUIRED_SYMBOLS,SCANNER_TIMEFRAMES
class BootstrapTests(unittest.TestCase):
 def setUp(self):
  scope=patch.object(Config,'DATA_ONLY',True);scope.start();self.addCleanup(scope.stop)
 def make(self):
  cloud,terminal=MagicMock(),MagicMock();terminal.check_connection.return_value=True;terminal.get_symbol_info.side_effect=lambda s:{'broker_symbol':s}
  def data(symbol,broker,frames,bars=140):return {'canonical_symbol':symbol,'broker_symbol':broker,'candles':[dict(timeframe=tf,open_time=f'{i:08d}',open=1,high=2,low=1,close=1.5) for tf in frames for i in range(bars)]}
  terminal.get_market_data.side_effect=data;cloud.publish_market_data.return_value=True;return MarketDataPublisher(cloud,terminal),cloud,terminal
 def test_four_bounded_batches_seed_all_history_then_publish_only_recent_bars(self):
  p,c,t=self.make();self.assertTrue(p.publish('account'));self.assertEqual(c.publish_market_data.call_count,4)
  for call in c.publish_market_data.call_args_list:
   self.assertEqual(len(call.args[1]),len(REQUIRED_SYMBOLS));self.assertTrue(all(len(f['candles'])<=1000 for f in call.args[1]))
  keys={(x['timeframe'],x['open_time']) for call in c.publish_market_data.call_args_list for x in call.args[1][0]['candles']};self.assertEqual(len(keys),4000)
  self.assertTrue(p.publish('account'));self.assertEqual(c.publish_market_data.call_count,5);self.assertEqual(t.get_market_data.call_args.kwargs['bars'],60)
 def test_failed_batch_is_retried_and_new_account_gets_own_seed(self):
  p,c,t=self.make();c.publish_market_data.side_effect=[True,False];self.assertFalse(p.publish('account'));c.publish_market_data.side_effect=None;c.publish_market_data.reset_mock();self.assertTrue(p.publish('account'));self.assertEqual(c.publish_market_data.call_count,4);self.assertEqual(t.get_market_data.call_args.kwargs['bars'],1000)
  c.publish_market_data.reset_mock();self.assertTrue(p.publish('other-account'));self.assertEqual(c.publish_market_data.call_count,4)
if __name__=='__main__':unittest.main()
