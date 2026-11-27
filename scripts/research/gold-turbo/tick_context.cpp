// Causal 5-second observations with closed-M1 context and optional training labels.
// Validation/test builds never calculate future labels. Quotes remain vendor order.
#include <vector>
#include <algorithm>
#include <cmath>
struct Context{std::vector<double>t,x,ref,atr,y;};
static double adverse(double p,bool up){return (up?std::ceil(p*100-1e-8):std::floor(p*100+1e-8))/100;}
extern "C" void* build_context(int nt,const double*t,const double*bid,const double*ask,int nm,const double*mt,const double*mx,const double*ma,const double*mc,bool labels){
 auto*c=new Context;int j=-1,w5=0,w15=0,w30=0;double next=-1,warm=t[0],shock=-1,open=bid[0],high=open,low=open;long long minute=-1;
 for(int i=0;i<nt;i++){
  if(i&&t[i]-t[i-1]>3000)warm=t[i];
  long long m=(long long)(t[i]/60000);if(m!=minute){minute=m;open=high=low=bid[i];}else{high=std::max(high,bid[i]);low=std::min(low,bid[i]);}
  while(j+1<nm&&mt[j+1]+60000<=t[i])j++;
  while(w5<i&&t[w5]<t[i]-5000)w5++;while(w15<i&&t[w15]<t[i]-15000)w15++;while(w30<i&&t[w30]<t[i]-30000)w30++;
  if(t[i]<next)continue;next=t[i]+5000;
  int clock=int(m%1440);if(clock<480||clock>955||j<0||t[i]-mt[j]-60000>=60000||t[i]-warm<30000)continue;
  double av=ma[j];if(!std::isfinite(av)||av<=0)continue;bool valid=true;for(int q=0;q<15;q++)valid&=std::isfinite(mx[j*15+q]);if(!valid)continue;
  double d5=bid[i]-bid[w5],d15=bid[i]-bid[w15],d30=bid[i]-bid[w30],hi=bid[i],lo=bid[i],meanSpread=0;int up=0,down=0;
  for(int z=w5;z<=i;z++){hi=std::max(hi,bid[z]);lo=std::min(lo,bid[z]);if(z>w5){up+=bid[z]>bid[z-1];down+=bid[z]<bid[z-1];}}
  for(int z=w30;z<=i;z++)meanSpread+=ask[z]-bid[z];meanSpread/=i-w30+1;
  if(high-low>3.5*av||std::abs(d5)>2*av)shock=t[i]+30000;
  if(t[i]<shock||(meanSpread>0&&ask[i]-bid[i]>3*meanSpread))continue;
  c->t.push_back(t[i]);c->ref.push_back(bid[i]);c->atr.push_back(av);
  for(int q=0;q<15;q++)c->x.push_back(q==12?(ask[i]-bid[i])/av:mx[j*15+q]);
  double lower=std::min(open,bid[i])-low,upper=high-std::max(open,bid[i]);
  double values[]={d5/av,d15/av,d30/av,(d5-d15/3)/av,up+down?double(up-down)/(up+down):0,(hi-lo)/av,hi>lo?(bid[i]-lo)/(hi-lo)-.5:0,double(i-w5+1)*6/(i-w30+1)-1,meanSpread>0?(ask[i]-bid[i])/meanSpread-1:0,(bid[i]-mc[j])/av,(bid[i]-open)/av,(lower-upper)/av,double((long long)t[i]%60000)/60000};
  for(double v:values)c->x.push_back(v);
  for(int d=0;d<2;d++){
   double result=NAN;int side=d==0?1:-1;
   if(labels){int k=std::lower_bound(t+i,t+nt,t[i]+200)-t;
    if(k<nt&&t[k]-t[i]<=2000&&t[k]-t[k-1]<=3000){
     double entry=adverse((side==1?ask[k]:bid[k])+side*.02,side==1),stop=adverse(bid[i]-side*.6*av,side==-1),target=bid[i]+side*.9*av,risk=side*(entry-stop),spread=ask[k]-bid[k];
     if(risk>=.1&&risk<=10*av&&side*(target-entry)>=.1&&spread<=.2*av&&spread+.11<=.25*risk&&side*(entry-bid[i])<=.25*risk){
      for(int z=k+1;z<nt;z++){double px=side==1?bid[z]:ask[z];if(side*(px-stop)<=0||side*(px-target)>=0||t[z]>=t[k]+120200){result=(side*(adverse(px-side*.02,side==-1)-entry)-.07)/risk;break;}}
     }
    }
   }
   c->y.push_back(result);
  }
 }
 return c;
}
extern "C" int context_count(void*p){return static_cast<Context*>(p)->t.size();}
extern "C" void context_copy(void*p,double*t,double*x,double*r,double*a,double*y){auto&c=*static_cast<Context*>(p);std::copy(c.t.begin(),c.t.end(),t);std::copy(c.x.begin(),c.x.end(),x);std::copy(c.ref.begin(),c.ref.end(),r);std::copy(c.atr.begin(),c.atr.end(),a);std::copy(c.y.begin(),c.y.end(),y);}
extern "C" void context_destroy(void*p){delete static_cast<Context*>(p);}
