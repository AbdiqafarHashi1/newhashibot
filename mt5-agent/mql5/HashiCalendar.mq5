#property strict
#property description "Read-only MT5 calendar export for HashiBridge. Never places or modifies orders."
input int RefreshSeconds=15;
string Escape(string value){StringReplace(value,"\\","\\\\");StringReplace(value,"\"","\\\"");return value;}
void Publish(bool complete,bool blocked){
 datetime utc=TimeGMT();
 string stamp=TimeToString(utc,TIME_DATE|TIME_SECONDS);StringReplace(stamp,".","-");StringReplace(stamp," ","T");stamp+="Z";
 string name="hashibot-calendar-"+(string)AccountInfoInteger(ACCOUNT_LOGIN)+".json";
 string json="{\"schema_version\":\"mt5-economic-calendar/v1\",\"observed_at\":\""+stamp+"\",\"complete\":"+(complete?"true":"false")+",\"high_impact_in_window\":"+(blocked?"true":"false")+",\"buffer_minutes\":30,\"currencies\":[\"USD\",\"EUR\",\"GBP\",\"JPY\",\"AUD\",\"CAD\",\"CHF\"],\"account_login\":\""+(string)AccountInfoInteger(ACCOUNT_LOGIN)+"\",\"server\":\""+Escape(AccountInfoString(ACCOUNT_SERVER))+"\"}";
 int handle=FileOpen(name+".pending",FILE_WRITE|FILE_TXT|FILE_COMMON|FILE_ANSI,0,CP_UTF8);
 if(handle==INVALID_HANDLE)return;
 FileWriteString(handle,json);FileFlush(handle);FileClose(handle);
 FileMove(name+".pending",FILE_COMMON,name,FILE_COMMON|FILE_REWRITE);
}
void OnTimer(){
 if(!TerminalInfoInteger(TERMINAL_CONNECTED)){Publish(false,true);return;}
 datetime server=TimeTradeServer();MqlDateTime date;
 if(server<=0||!TimeToStruct(server,date)){Publish(false,true);return;}
 date.hour=0;date.min=0;date.sec=0;datetime day=StructToTime(date);
 MqlCalendarValue values[];ResetLastError();
 int count=CalendarValueHistory(values,day-3600,day+86400+3600);
 if(count<0||GetLastError()!=0){Publish(false,true);return;}
 bool blocked=false;
 for(int i=0;i<count;i++){
  MqlCalendarEvent event;
  if(!CalendarEventById(values[i].event_id,event)){Publish(false,true);return;}
  if(event.importance!=CALENDAR_IMPORTANCE_HIGH)continue;
  MqlCalendarCountry country;
  if(!CalendarCountryById(event.country_id,country)){Publish(false,true);return;}
  if(StringFind("|USD|EUR|GBP|JPY|AUD|CAD|CHF|","|"+country.currency+"|")<0)continue;
  if(event.time_mode!=CALENDAR_TIMEMODE_DATETIME||MathAbs((long)values[i].time-(long)server)<=1800)blocked=true;
 }
 Publish(true,blocked);
}
int OnInit(){if(RefreshSeconds<5||RefreshSeconds>30)return INIT_PARAMETERS_INCORRECT;EventSetTimer(RefreshSeconds);OnTimer();return INIT_SUCCEEDED;}
void OnDeinit(const int reason){EventKillTimer();}
