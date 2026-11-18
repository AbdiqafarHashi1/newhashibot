// Chronological multi-asset account screen. No production or provider authority.
#include <algorithm>
#include <cmath>
#include <vector>
struct Position{int side=0,opened=0;double q=0,entry=0,stop=0,target=0,fees=0,funding=0,risk=0;};
extern "C" int simulate(int n,int m,const double* o,const double* h,const double* l,const double* c,const double* atr,const signed char* signal,const double* times,const int* month,const double* steps,const double* ticks,int begin,int end,double riskPct,double leverage,double stopAtr,double reward,int hold,double feeBps,double spreadBps,double slipBps,double carryBps,double openRiskPct,int maxPositions,double maxLossPct,double capital,double* out,double* monthReturns,double* dailyReturns,double* equityPath,double* trades,int capacity){
 if(n<2||m<1||begin<1||end>n||end<=begin||leverage<1||riskPct<=0)return -1;
 std::vector<Position> p(m);double balance=capital,equity=capital,peak=capital,dd=0,dayStart=capital,monthStart=capital,gains=0,losses=0,costs=0;int liquidations=0;int day=-1,mon=-1,closed=0,entries=0,blocked=0,locked=0,failed=0,active=0;
 auto close=[&](int j,int i,double reference,int reason){auto &v=p[j];if(!v.side)return;double price=reference*(1-v.side*(spreadBps*.5+slipBps)/10000);price=(v.side==1?std::floor(price/ticks[j]):std::ceil(price/ticks[j]))*ticks[j];double exitFee=v.q*price*feeBps/10000,gross=v.side*(price-v.entry)*v.q,net=gross-v.fees-exitFee-v.funding;balance+=gross-exitFee;costs+=exitFee;if(net>0)gains+=net;else losses-=net;if(closed<capacity){double* t=trades+closed*9;t[0]=j;t[1]=times[v.opened];t[2]=times[i];t[3]=v.side;t[4]=v.entry;t[5]=price;t[6]=net;t[7]=net/v.risk;t[8]=reason;}closed++;v=Position{};active--;};
 auto mark=[&](int i,bool adverse){double e=balance;for(int j=0;j<m;j++)if(p[j].side){int k=i*m+j;double price=adverse?(p[j].side==1?std::max(l[k],p[j].stop):std::min(h[k],p[j].stop)):c[k];e+=p[j].side*(price-p[j].entry)*p[j].q;}return e;};
 for(int i=begin;i<end;i++){
  int d=int(times[i]/86400000);if(d!=day){if(day>=0)dailyReturns[day%2000]=(equity/dayStart-1)*100;day=d;dayStart=equity;locked=0;}
  if(month[i]!=mon){if(mon>=0)monthReturns[mon]=(equity/monthStart-1)*100;mon=month[i];monthStart=equity;}
  for(int j=0;j<m;j++)if(p[j].side){auto &v=p[j];int k=i*m+j;if((v.side==1&&o[k]<=v.stop)||(v.side==-1&&o[k]>=v.stop)){close(j,i,o[k],1);continue;}if((v.side==1&&o[k]>=v.target)||(v.side==-1&&o[k]<=v.target)){close(j,i,v.target,2);continue;}}
  equity=balance;double margin=0,openRisk=0;for(int j=0;j<m;j++)if(p[j].side){int k=i*m+j;equity+=p[j].side*(o[k]-p[j].entry)*p[j].q;margin+=p[j].q*o[k]/leverage;openRisk+=std::max(0.0,p[j].side*(p[j].entry-p[j].stop))*p[j].q;}
  if(!failed&&!locked)for(int j=0;j<m;j++){int k=i*m+j,side=signal[k];if(!side||p[j].side||!std::isfinite(atr[k])||atr[k]<=0)continue;if(active>=maxPositions){blocked++;continue;}double price=o[k]*(1+side*(spreadBps*.5+slipBps)/10000);price=(side==1?std::ceil(price/ticks[j]):std::floor(price/ticks[j]))*ticks[j];double dist=atr[k]*stopAtr,budget=std::min(equity*riskPct/100,std::max(0.0,equity*openRiskPct/100-openRisk)),free=std::max(0.0,equity-margin);double q=std::floor(std::min(budget/dist,free/(price/leverage+price*feeBps/10000))/steps[j])*steps[j];if(q<steps[j]||q*price<10||budget<=0){blocked++;continue;}auto &v=p[j];v.side=side;v.q=q;v.entry=price;v.stop=price-side*dist;v.target=price+side*dist*reward;v.fees=q*price*feeBps/10000;v.risk=q*dist;v.opened=i;balance-=v.fees;equity-=v.fees;costs+=v.fees;margin+=q*price/leverage;openRisk+=q*dist;active++;entries++;}
  if(std::fmod(times[i],28800000)==0)for(int j=0;j<m;j++)if(p[j].side){double charge=p[j].q*o[i*m+j]*carryBps/10000;balance-=charge;p[j].funding+=charge;costs+=charge;}
  double adverse=mark(i,true);dd=std::max(dd,(peak-adverse)/peak*100);
  double exposure=0;for(int j=0;j<m;j++)if(p[j].side)exposure+=p[j].q*c[i*m+j];
  if(exposure>0&&adverse<=exposure*.005){liquidations++;failed=1;for(int j=0;j<m;j++)if(p[j].side)close(j,i,p[j].side==1?std::max(l[i*m+j],p[j].stop):std::min(h[i*m+j],p[j].stop),6);}
  if(adverse<=capital*(1-maxLossPct/100)){failed=1;for(int j=0;j<m;j++)if(p[j].side)close(j,i,p[j].side==1?std::max(l[i*m+j],p[j].stop):std::min(h[i*m+j],p[j].stop),5);}
  if(adverse<=dayStart*.95)locked=1;
  for(int j=0;j<m;j++)if(p[j].side){auto &v=p[j];int k=i*m+j;if((v.side==1&&l[k]<=v.stop)||(v.side==-1&&h[k]>=v.stop)){close(j,i,v.stop,3);continue;}if((v.side==1&&h[k]>=v.target)||(v.side==-1&&l[k]<=v.target)){close(j,i,v.target,2);continue;}if(i-v.opened>=hold)close(j,i,c[k],4);}
  equity=mark(i,false);peak=std::max(peak,equity);dd=std::max(dd,(peak-equity)/peak*100);equityPath[i]=equity;
 }
 if(mon>=0)monthReturns[mon]=(equity/monthStart-1)*100;out[0]=equity;out[1]=dd;out[2]=gains;out[3]=losses;out[4]=closed;out[5]=entries;out[6]=blocked;out[7]=failed;out[8]=costs;out[9]=active;out[10]=liquidations;return closed>capacity?-2:0;
}
