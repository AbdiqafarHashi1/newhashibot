#include <algorithm>
#include <cmath>
extern "C" int micro_screen(int n,const double*t,const double*bid,const double*ask,const double*hi,const double*lo,const double*ahi,const double*alo,const double*close,const double*aclose,const double*atr,const double*level,const double*reference,const signed char*signal,int begin,int end,double risk,double leverage,double stopATR,double rr,double hold,int style,int session,double commission,double slip,double capital,double*out,double*trades,int capacity){
 if(begin<1||end>n||end<=begin||risk<=0||risk>1||leverage<=0||leverage>30||hold<1||hold>15)return -1;
 double bal=capital,eq=capital,peak=capital,dd=0,gain=0,loss=0,cost=0,dayStart=capital;int day=-1,side=0,count=0,entries=0,blocked=0;bool locked=false,failed=false;
 double qty=0,entry=0,stop=0,target=0,opened=0,initialRisk=0,fees=0,best=0,lastImprove=0,exitAt=-1;
 auto round=[](double p,bool buy){return (buy?std::ceil(p*100-1e-8):std::floor(p*100+1e-8))/100;};
 auto finish=[&](double px,double at,int reason){px=round(px-side*slip,side<0);double gross=side*(px-entry)*qty*100,fee=qty*commission,net=gross-fees-fee;bal+=gross-fee;cost+=fee;if(net>0)gain+=net;else loss-=net;if(count>=capacity)return false;double*v=trades+count*12;v[0]=opened;v[1]=at;v[2]=side;v[3]=entry;v[4]=px;v[5]=qty;v[6]=net;v[7]=net/initialRisk;v[8]=reason;v[9]=initialRisk;v[10]=best;v[11]=(at-opened)/60000;count++;side=0;exitAt=at;eq=bal;return true;};
 for(int i=begin;i<end;i++){
  int d=int(t[i]/86400000);if(d!=day){day=d;dayStart=bal;locked=false;}
  int hour=int(std::fmod(t[i],86400000)/3600000);bool active=hour>=(session?7:1)&&hour<(session?18:20);
  if(side){double px=side>0?bid[i]:ask[i],dist=initialRisk/(qty*100);
   if(style==2&&best>=.75*dist){double lock=std::max(best>=1.2*dist?.4*dist:.1*dist,2*commission/100+slip+.05*dist);double proposed=entry+side*std::max(lock,best-.75*atr[i]);stop=side>0?std::max(stop,proposed):std::min(stop,proposed);}
   if(side*(px-stop)<=0){if(!finish(px,t[i],1))return -2;}
   else if(side*(px-target)>=0){if(!finish(target,t[i],2))return -2;}
   else if(t[i]-opened>=hold*60000||!active){if(!finish(px,t[i],3))return -2;}
   else if(style==1&&t[i]-lastImprove>=180000&&side*(px-entry)>=.25*dist){if(!finish(px,t[i],4))return -2;}
  }
  if(!side&&signal[i]&&active&&!locked&&!failed&&t[i]-exitAt>=60000&&std::isfinite(atr[i])&&std::isfinite(level[i])){
   int s=signal[i];double px=round((s>0?ask[i]:bid[i])+s*slip,s>0),st=s>0?std::min(px-stopATR*atr[i],level[i]):std::max(px+stopATR*atr[i],level[i]);st=round(st,s<0);double dist=s*(px-st),spread=ask[i]-bid[i],expense=spread+2*slip+2*commission/100;
   if(dist<=0||spread>.2*atr[i]||expense>.25*dist||s*(px-reference[i])>.25*dist){blocked++;continue;}
   // Reserve existing daily/overall loss room before allocating this single position.
   double room=std::min(capital*.02-(dayStart-bal),capital*.08-(peak-bal)),budget=std::min(bal*risk/100,std::max(0.,room-commission*.01));double q=std::floor(std::min(budget/(dist*100),bal*leverage/(px*100))*100)/100;
   if(q<.01||q*px*100/100+q*commission>bal){blocked++;continue;}
   side=s;entry=px;stop=st;target=entry+s*dist*rr;qty=q;opened=t[i];initialRisk=qty*100*dist;fees=qty*commission;cost+=fees;bal-=fees;best=0;lastImprove=t[i];entries++;
  }
  if(side){double adverse=side>0?std::max(lo[i],stop):std::min(ahi[i],stop),worst=bal+side*(adverse-entry)*qty*100;dd=std::max(dd,(peak-worst)/peak*100);if(worst<=dayStart-capital*.02)locked=true;if(worst<=peak-capital*.08)failed=true;
   if(side>0?lo[i]<=stop:ahi[i]>=stop){if(!finish(stop,t[i]+59999,5))return -2;}
   else if(side>0?hi[i]>=target:alo[i]<=target){if(!finish(target,t[i]+59999,6))return -2;}
   else {double favorable=side>0?hi[i]-entry:entry-alo[i];if(favorable>best+.05*initialRisk/(qty*100)){best=favorable;lastImprove=t[i]+59999;}eq=bal+side*((side>0?close[i]:aclose[i])-entry)*qty*100;}
  }else eq=bal;
  peak=std::max(peak,eq);dd=std::max(dd,(peak-eq)/peak*100);if(eq<=dayStart-capital*.02)locked=true;if(eq<=peak-capital*.08)failed=true;
 }
 if(side&&!finish(side>0?close[end-1]:aclose[end-1],t[end-1]+59999,7))return -2;
 out[0]=bal;out[1]=dd;out[2]=gain;out[3]=loss;out[4]=count;out[5]=entries;out[6]=blocked;out[7]=failed;out[8]=cost;return 0;
}
