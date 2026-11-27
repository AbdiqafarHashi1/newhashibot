// Independent overlapping training labels on original bid/ask ticks.
// Fixed entry delay, observed-quote barrier fills, adverse tick rounding and fees.
// This is a label generator, not provider execution or account backtesting.
#include <algorithm>
#include <cmath>
static double adverse(double p,bool up){return (up?std::ceil(p*100-1e-8):std::floor(p*100+1e-8))/100;}
extern "C" void barrier_labels(int nt,const double*t,const double*bid,const double*ask,int n,const double*at,const double*ref,const double*atr,double*out){
 for(int i=0;i<n;i++)for(int d=0;d<2;d++){
  out[i*2+d]=NAN;if(!std::isfinite(atr[i])||atr[i]<=0)continue;
  int side=d==0?1:-1;int j=std::lower_bound(t,t+nt,at[i])-t;
  if(j>=nt||t[j]-at[i]>30000)continue;
  int k=std::lower_bound(t+j,t+nt,t[j]+200)-t;
  if(k>=nt||t[k]-t[j]>2000||(k>0&&t[k]-t[k-1]>3000))continue;
  double entry=adverse((side==1?ask[k]:bid[k])+side*.02,side==1);
  double stop=adverse(ref[i]-side*atr[i],side==-1),target=ref[i]+side*1.5*atr[i];
  double risk=side*(entry-stop),spread=ask[k]-bid[k];
  if(risk<.1||risk>10*atr[i]||side*(target-entry)<.1||spread>.2*atr[i]||spread+.11>.25*risk||side*(entry-ref[i])>.25*risk)continue;
  double exit=NAN,deadline=t[k]+300200;
  for(int z=k+1;z<nt;z++){
   double px=side==1?bid[z]:ask[z];
   if(side*(px-stop)<=0||side*(px-target)>=0||t[z]>=deadline){exit=adverse(px-side*.02,side==-1);break;}
  }
  if(std::isfinite(exit))out[i*2+d]=(side*(exit-entry)-.07)/risk;
 }
}
