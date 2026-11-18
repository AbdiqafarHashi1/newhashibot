// Native bid/ask portfolio screen. Strategy selection research, never order authorization.
#include <algorithm>
#include <cmath>
#include <vector>
struct P {int side=0;double qty=0,entry=0,stop=0,target=0,opened=0,last=0,fees=0,carry=0,risk=0;};
extern "C" int broker_screen(int n,int m,const double* bid,const double* ask,const double* hi,const double* lo,const double* ahi,const double* alo,const double* close,const double* aclose,const double* atr,const signed char* sig,const double* time,const double* contracts,const double* ticks,const int* inverse,int begin,int end,double riskPct,double leverage,double stopAtr,double rr,double holdMs,double commission,double slipBps,double capital,double* out,double* trades,int capacity){
 if(begin<1||end>n||end<=begin||m<1)return -1;
 std::vector<P> p(m);double bal=capital,eq=capital,peak=capital,dd=0,gains=0,losses=0,costs=0,dayStart=capital;int entries=0,closes=0,blocked=0,day=-1,active=0;bool failed=false,locked=false;
 auto conv=[&](int j,double price){return inverse[j]?1/price:1;};
 auto round=[&](int j,double price,bool buy){return (buy?std::ceil(price/ticks[j]-1e-8):std::floor(price/ticks[j]+1e-8))*ticks[j];};
 auto exit=[&](int j,int i,double reference,int reason){auto &v=p[j];double px=round(j,reference*(1-v.side*slipBps/10000),v.side<0),gross=v.side*(px-v.entry)*v.qty*contracts[j]*conv(j,px),fee=v.qty*commission,net=gross-v.fees-v.carry-fee;bal+=gross-fee;costs+=fee;if(net>0)gains+=net;else losses-=net;if(closes<capacity){double* t=trades+closes*9;t[0]=j;t[1]=v.opened;t[2]=time[i];t[3]=v.side;t[4]=v.entry;t[5]=px;t[6]=net;t[7]=net/v.risk;t[8]=reason;}closes++;v=P{};active--;};
 for(int i=begin;i<end;i++){
  int d=int(time[i]/86400000);if(d!=day){day=d;dayStart=eq;locked=false;}
  for(int j=0;j<m;j++)if(p[j].side){auto &v=p[j];int k=i*m+j;if(!std::isfinite(bid[k]))continue;double px=v.side>0?bid[k]:ask[k];v.last=px;if(v.side*(px-v.stop)<=0)exit(j,i,px,1);else if(v.side*(px-v.target)>=0)exit(j,i,v.target,2);else if(time[i]-v.opened>=holdMs)exit(j,i,px,3);}
  eq=bal;double margin=0,risk=0;for(int j=0;j<m;j++)if(p[j].side){auto &v=p[j];double cv=conv(j,v.last);eq+=v.side*(v.last-v.entry)*v.qty*contracts[j]*cv;margin+=v.qty*contracts[j]*v.last*cv/leverage;risk+=std::max(0.,v.side*(v.entry-v.stop))*v.qty*contracts[j]*cv;}
  if(!failed&&!locked)for(int j=0;j<m;j++){int k=i*m+j;if(!sig[k]||p[j].side||!std::isfinite(bid[k])||!std::isfinite(atr[k])||atr[k]<=0)continue;if(active>=4){blocked++;continue;}int side=sig[k];double reference=side>0?ask[k]:bid[k],px=round(j,reference*(1+side*slipBps/10000),side>0),cv=conv(j,px),dist=atr[k]*stopAtr,budget=std::min(eq*riskPct/100,std::max(0.,eq*.03-risk)),free=std::max(0.,eq-margin),qty=std::floor(std::min(budget/(dist*contracts[j]*cv),free/(contracts[j]*px*cv/leverage+commission))*100)/100;if(qty<.01){blocked++;continue;}auto &v=p[j];v.side=side;v.qty=qty;v.entry=px;v.stop=px-side*dist;v.target=px+side*dist*rr;v.opened=time[i];v.last=side>0?bid[k]:ask[k];v.fees=qty*commission;v.risk=qty*contracts[j]*cv*dist;bal-=v.fees;eq-=v.fees;costs+=v.fees;margin+=qty*contracts[j]*px*cv/leverage;risk+=v.risk;active++;entries++;}
  // Explicit adverse carry reserve, independent of any actual swap-free account.
  if(std::fmod(time[i],86400000)==79200000)for(int j=0;j<m;j++)if(p[j].side){auto &v=p[j];double cost=v.qty*contracts[j]*v.last*conv(j,v.last)*.0001;bal-=cost;v.carry+=cost;costs+=cost;}
  double adverse=bal;for(int j=0;j<m;j++)if(p[j].side){auto &v=p[j];int k=i*m+j;double px=std::isfinite(bid[k])?(v.side>0?std::max(lo[k],v.stop):std::min(ahi[k],v.stop)):v.last;adverse+=v.side*(px-v.entry)*v.qty*contracts[j]*conv(j,px);}
  dd=std::max(dd,(peak-adverse)/peak*100);if(adverse<=dayStart*.95)locked=true;if(adverse<=capital*.88)failed=true;
  for(int j=0;j<m;j++)if(p[j].side){auto &v=p[j];int k=i*m+j;if(!std::isfinite(bid[k]))continue;double low=v.side>0?lo[k]:alo[k],high=v.side>0?hi[k]:ahi[k];if(v.side>0?low<=v.stop:high>=v.stop)exit(j,i,v.stop,4);else if(v.side>0?high>=v.target:low<=v.target)exit(j,i,v.target,5);else v.last=v.side>0?close[k]:aclose[k];}
  eq=bal;for(int j=0;j<m;j++)if(p[j].side){auto &v=p[j];eq+=v.side*(v.last-v.entry)*v.qty*contracts[j]*conv(j,v.last);}peak=std::max(peak,eq);
 }
 out[0]=eq;out[1]=dd;out[2]=gains;out[3]=losses;out[4]=closes;out[5]=entries;out[6]=blocked;out[7]=failed;out[8]=costs;out[9]=active;return 0;
}
