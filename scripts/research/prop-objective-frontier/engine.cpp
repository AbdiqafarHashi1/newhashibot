#include <algorithm>
#include <cmath>
#include <vector>
struct Account{double capital,risk,lev,comm,slip,delay,contract,tick;double evalRisk=.5,fundedRisk=.25;int jpy,style,prop=0,positionStyle=0,pendingStyle=0,phase=0,minimumDays=4,entryDays=0,lastEntryDay=-1,guard=0;double start=0,end=0,challengeTarget=10,fundedTarget=2,resumeAt=0,fundedAt=0,financialAt=0,requestAt=0,firstEntry=0,bankExitDue=0;bool banked=false,finished=false;std::vector<double>events;double stopATR,rr,hold;double bal,eq=0,peak,dd=0,gain=0,loss=0,cost=0,dayStart;int day=-1,side=0,pending=0,closed=0,blocked=0;double entry=0,stop=0,target=0,qty=0,opened=0,initialRisk=0,fees=0,best=0,stopDue=0,stopNext=0,exitDue=0,pendingAt=0,pendingUntil=0,planStop=0,planTarget=0,planRef=0,lastClient=-1,lastExit=-1;bool locked=false,failed=false;std::vector<double>trades;};
struct Engine{int minutes,index=-1,seen=-1;const double*time,*atr,*structure;const signed char*signal;double last=-1,bid=0,ask=0;std::vector<Account>accounts;};
static double unit(const Account&a,double p){return a.contract/(a.jpy?p:1.);}
static double roundp(const Account&a,double p,bool buy){return (buy?std::ceil(p/a.tick-1e-8):std::floor(p/a.tick+1e-8))*a.tick;}
static void finish(Account&a,double px,double t,int reason){px=roundp(a,px-a.side*a.slip,a.side<0);double gross=a.side*(px-a.entry)*a.qty*unit(a,px),fee=a.qty*a.comm,net=gross-fee-a.fees;a.bal+=gross-fee;a.cost+=fee;a.gain+=std::max(0.,net);a.loss-=std::min(0.,net);a.trades.insert(a.trades.end(),{a.opened,t,double(a.side),a.entry,px,a.qty,net,net/a.initialRisk,double(reason),a.initialRisk,0,(t-a.opened)/60000});a.closed++;a.side=0;a.stopDue=0;a.exitDue=0;a.lastExit=t;}
extern "C" void* create(int minutes,const double*time,const signed char*signal,const double*atr,const double*structure,int count,const double*cfg){auto*e=new Engine{minutes,-1,-1,time,atr,structure,signal};for(int i=0;i<count;i++){const double*c=cfg+i*21;Account a;a.contract=c[0];a.tick=c[1];a.comm=c[2];a.slip=c[3];a.risk=c[4];a.lev=c[5];a.stopATR=c[6];a.rr=c[7];a.hold=c[8];a.style=c[9];a.capital=c[10];a.jpy=c[11];a.delay=c[12];a.evalRisk=c[4];a.fundedRisk=c[20];a.prop=1;a.start=c[13];a.end=c[14];a.phase=c[15];a.challengeTarget=c[16];a.fundedTarget=c[17];a.guard=c[18];a.minimumDays=c[19];a.fundedAt=a.phase==2?a.start:0;a.bal=a.eq=a.peak=a.dayStart=a.capital;if(a.style!=0&&a.style!=1&&a.style!=2){delete e;return nullptr;}e->accounts.push_back(a);}return e;}
extern "C" int feed(void*p,int count,const double*time,const double*bid,const double*ask){auto&e=*static_cast<Engine*>(p);for(int j=0;j<count;j++){double t=time[j],b=bid[j],s=ask[j];if(!std::isfinite(t)||!std::isfinite(b)||!std::isfinite(s)||b<=0||s<b||t<e.last)return -1;e.last=t;e.bid=b;e.ask=s;while(e.index+1<e.minutes&&e.time[e.index+1]<=t)e.index++;if(e.index<0)continue;int k=e.index;bool first=e.seen!=k;e.seen=k;int day=int(t/86400000),hour=int(std::fmod(t,86400000)/3600000);bool active=hour>=6&&hour<20;
 for(auto&a:e.accounts){
  if(a.finished||t<a.start||t<a.resumeAt)continue;
  auto event=[&](int code){a.events.insert(a.events.end(),{t,double(code),double(a.phase),a.bal,a.eq,double(a.entryDays),a.risk});};
  if(t>=a.end){if(a.side)finish(a,a.side>0?b:s,t,10);a.eq=a.bal;a.dd=std::max(a.dd,(a.peak-a.eq)/a.peak*100);event(8);a.finished=true;continue;}
  if(a.phase==3){if(t>=a.requestAt){event(4);a.finished=true;}continue;}
  bool client=a.lastClient<0||t-a.lastClient>=1000;if(client)a.lastClient=t;if(a.day!=day){if(a.day>=0&&a.side){double carry=(day-a.day)*a.qty*(a.jpy?a.contract:a.contract*(a.side>0?b:s))*.00015; a.bal-=carry;a.cost+=carry;a.fees+=carry;}a.day=day;a.dayStart=a.bal;a.locked=false;}
  if(a.side){double px=a.side>0?b:s;if(a.side*(px-a.stop)<=0)finish(a,px,t,1);else if(a.side*(px-a.target)>=0)finish(a,a.target,t,2);else if(a.stopDue&&t>=a.stopDue){a.stopDue=0;if(a.side*(px-a.stopNext)<=0)finish(a,px,t,8);else a.stop=a.stopNext;}
   if(a.side){if(a.exitDue&&t>=a.exitDue)finish(a,px,t,3);else if(client){double dist=a.initialRisk/(a.qty*unit(a,a.entry));if(!a.exitDue&&(t-a.opened>=a.hold*60000))a.exitDue=t+1000;a.best=std::max(a.best,a.side*(px-a.entry));if(!a.stopDue&&((a.positionStyle==1&&a.best>=dist)||(a.positionStyle==2&&a.best>=2*dist))){double st=a.positionStyle==1?a.entry+a.side*(2*a.comm/unit(a,a.entry)+2*a.slip):a.entry+a.side*std::max(.5*dist,a.best-2*e.atr[k]);if(a.side*(st-a.stop)>.5*a.tick){a.stopNext=roundp(a,st,a.side<0);a.stopDue=t+1000;}}}}
  }
  if(first&&!a.side&&!a.pending&&e.signal[k]&&active&&!a.locked&&!a.failed&&(!a.banked||a.entryDays<a.minimumDays)&&t-e.time[k]<=30000&&t-a.lastExit>=60000&&std::isfinite(e.atr[k])&&std::isfinite(e.structure[k])){
   int side=e.signal[k]>0?1:-1;a.pendingStyle=std::abs(int(e.signal[k]))==3?0:a.style;double px=roundp(a,(side>0?s:b)+side*a.slip,side>0),st=side>0?std::min(px-a.stopATR*e.atr[k],e.structure[k]):std::max(px+a.stopATR*e.atr[k],e.structure[k]);st=roundp(a,st,side<0);double distance=side*(px-st);a.pending=side;a.pendingAt=t+a.delay;a.pendingUntil=t+30000;a.planStop=st;a.planTarget=px+side*distance*a.rr;a.planRef=px;
  }
  if(a.pending&&!a.side&&t>=a.pendingAt){int side=a.pending;a.pending=0;double px=roundp(a,(side>0?s:b)+side*a.slip,side>0),dist=side*(px-a.planStop),expense=s-b+2*a.slip+2*a.comm/unit(a,px),notional=a.jpy?a.contract:a.contract*px;double daily=a.capital*((a.guard==0?.02:a.guard==1?.045:a.phase<2?.045:.04)),overall=a.capital*((a.guard==1?.09:a.guard==2&&a.phase<2?.09:.08)),room=std::min(daily-(a.dayStart-a.bal),overall-((a.guard==1?a.capital:a.peak)-a.bal)),budget=std::min(a.bal*a.risk/100.,std::max(0.,room)),q=std::floor(std::min(budget/(dist*unit(a,px)+2*a.comm),a.bal*a.lev/notional)*100)/100;
   if(t>a.pendingUntil||!active||a.locked||a.failed||dist<=0||side*(a.planTarget-px)<=0||side*(px-a.planRef)>.25*dist||expense>.25*dist||s-b>.25*e.atr[k]||q<.01||q*notional/100+q*a.comm>a.bal){a.blocked++;continue;}
   if(a.firstEntry==0)a.firstEntry=t;if(a.lastEntryDay!=day){a.lastEntryDay=day;a.entryDays++;}a.side=side;a.positionStyle=a.pendingStyle;a.entry=px;a.stop=a.planStop;a.target=a.planTarget;a.qty=q;a.opened=t;a.initialRisk=q*dist*unit(a,px);a.best=0;a.fees=q*a.comm;a.bal-=a.fees;a.cost+=a.fees;
  }
  double px=a.side>0?b:s,eq=a.bal+(a.side?a.side*(px-a.entry)*a.qty*unit(a,px)-a.qty*a.comm:0);a.eq=eq;a.peak=std::max(a.peak,eq);a.dd=std::max(a.dd,(a.peak-eq)/a.peak*100);if(eq<=a.dayStart-a.capital*((a.guard==0?.02:a.guard==1?.045:a.phase<2?.045:.04)))a.locked=true;if(eq<=(a.guard==1?a.capital:a.peak)-a.capital*((a.guard==1?.09:a.guard==2&&a.phase<2?.09:.08)))a.failed=true;
  if(a.failed){if(a.side)finish(a,a.side>0?b:s,t,11);a.eq=a.bal;a.dd=std::max(a.dd,(a.peak-a.eq)/a.peak*100);event(9);a.finished=true;continue;}
  const double goal=a.phase==0?a.challengeTarget:a.phase==1?5:a.fundedTarget;
  const double closeReserve=a.side?a.qty*unit(a,a.side>0?b:s)*(a.slip+2*a.tick):0;
  if(a.firstEntry&&a.eq-closeReserve>=a.capital*(1+goal/100.)){
   if(!a.banked){a.banked=true;a.pending=0;}
   if(a.side&&!a.exitDue)a.exitDue=t+1000;
  }
  if(a.banked&&!a.side){
   if(a.bal<a.capital*(1+goal/100.)){a.banked=false;continue;}
   if(a.phase<2&&a.entryDays<a.minimumDays){a.risk=.05;continue;}
   event(1);
   if(a.phase==2){a.financialAt=t;a.requestAt=std::max(t,a.firstEntry+14*86400000.);a.phase=3;if(t>=a.requestAt){event(4);a.finished=true;}continue;}
   a.phase++;if(a.phase==2)a.fundedAt=t+86400000.;
   a.resumeAt=t+86400000.;a.bal=a.eq=a.peak=a.dayStart=a.capital;a.day=-1;a.locked=false;a.banked=false;a.pending=0;a.entryDays=0;a.lastEntryDay=-1;a.firstEntry=0;a.risk=a.phase==2?a.fundedRisk:a.evalRisk;event(2);
  }

 }
}return 0;}
extern "C" int summary(void*p,int index,double*out,double*trades,int capacity){auto&e=*static_cast<Engine*>(p);auto&a=e.accounts[index];if(a.closed>capacity)return -1;std::copy(a.trades.begin(),a.trades.end(),trades);out[0]=a.phase;out[1]=a.fundedAt;out[2]=a.financialAt;out[3]=a.requestAt;out[4]=a.failed;out[5]=a.bal;out[6]=a.eq;out[7]=a.dd;out[8]=a.closed;out[9]=a.finished;out[10]=a.entryDays;out[11]=a.blocked;out[12]=a.firstEntry;out[13]=e.last;return a.closed;}
extern "C" int events(void*p,int index,double*out,int capacity){auto&a=static_cast<Engine*>(p)->accounts[index];int n=a.events.size()/7;if(n>capacity)return -1;std::copy(a.events.begin(),a.events.end(),out);return n;}
extern "C" void destroy(void*p){delete static_cast<Engine*>(p);}
