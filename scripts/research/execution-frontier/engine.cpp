#include <algorithm>
#include <cmath>
// Native M1 conservative screen: new decisions / management only after a closed bar.
extern "C" int frontier(int n,const double* x,const signed char* signal,const double* atr,const double* structure,const double* cfg,double*out,double* ledger,int capacity){
 const double contract=cfg[0],tick=cfg[1],commission=cfg[2],slip=cfg[3],riskPct=cfg[4],leverage=cfg[5],stopAtr=cfg[6],reward=cfg[7],hold=cfg[8],capital=cfg[10];const int style=cfg[9],jpy=cfg[11];
 double bal=capital,peak=capital,dd=0,gains=0,losses=0,costs=0,dayStart=capital;int day=-1,side=0,count=0,blocked=0,wins=0,streak=0,maxStreak=0;bool locked=false,failed=false;
 double entry=0,stop=0,target=0,qty=0,originalQty=0,opened=0,initialRisk=0,best=0,stopNext=0,feesPaid=0,partialNet=0,exitTime=-1;bool partial=false;
 auto unit=[&](double price){return contract/(jpy?price:1.);};
 auto rounding=[&](double p,bool buy){return (buy?std::ceil(p/tick-1e-8):std::floor(p/tick+1e-8))*tick;};
 auto finish=[&](double price,double at,int reason){
  price=rounding(price-side*slip,side<0);double fee=qty*commission,net=side*(price-entry)*qty*unit(price)-fee-feesPaid+partialNet;bal+=side*(price-entry)*qty*unit(price)-fee;costs+=fee;
  if(count>=capacity)return false;double* t=ledger+count*12;t[0]=opened;t[1]=at;t[2]=side;t[3]=entry;t[4]=price;t[5]=originalQty;t[6]=net;t[7]=net/initialRisk;t[8]=reason;t[9]=initialRisk;t[10]=partial;t[11]=(at-opened)/60000.;count++;gains+=std::max(0.,net);losses-=std::min(0.,net);wins+=net>0;streak=net<=0?streak+1:0;maxStreak=std::max(streak,maxStreak);side=0;exitTime=at;return true;
 };
 for(int i=0;i<n;i++){
  const double* b=x+i*9;double time=b[0],bid=b[1],ask=b[2],high=b[3],low=b[4],askHigh=b[5],askLow=b[6],close=b[7],askClose=b[8];int d=int(time/86400000),hour=int(std::fmod(time,86400000)/3600000);bool active=hour>=6&&hour<20;
  if(day!=d){day=d;dayStart=bal;locked=false;}
  if(side){if(stopNext){stop=stopNext;stopNext=0;}double px=side>0?bid:ask;
   if(side*(px-stop)<=0){if(!finish(px,time,1))return -2;}
   else if(side*(px-target)>=0){if(!finish(target,time,2))return -2;}
   else if(!active||time-opened>=hold*60000){if(!finish(px,time,3))return -2;}
  }
  if(!side&&signal[i]&&active&&!locked&&!failed&&time-exitTime>=60000&&std::isfinite(atr[i])&&std::isfinite(structure[i])){
   int s=signal[i];double price=rounding((s>0?ask:bid)+s*slip,s>0),st=s>0?std::min(price-stopAtr*atr[i],structure[i]):std::max(price+stopAtr*atr[i],structure[i]);st=rounding(st,s<0);double distance=s*(price-st),expense=(ask-bid)+2*slip+2*commission/unit(price),notional=jpy?contract:contract*price;
   double daily=capital*(riskPct>.25?.04:.02),overall=capital*(riskPct>.25?.12:.08),room=std::min(daily-(dayStart-bal),overall-(peak-bal));double budget=std::min(bal*riskPct/100.,std::max(0.,room));double q=std::floor(std::min(budget/(distance*unit(price)+2*commission),bal*leverage/notional)*100.)/100.;
   if(distance<=0||expense>.25*distance||(ask-bid)>.25*atr[i]||q<.01||q*notional/100.+q*commission>bal){blocked++;continue;}
   side=s;entry=price;stop=st;target=entry+side*distance*reward;qty=originalQty=q;opened=time;initialRisk=q*distance*unit(price);feesPaid=q*commission;bal-=feesPaid;costs+=feesPaid;best=0;partialNet=0;partial=false;
  }
  double eq=bal;
  if(side){double distance=initialRisk/(originalQty*unit(entry)),adverse=side>0?std::max(low,stop):std::min(askHigh,stop),worst=bal+side*(adverse-entry)*qty*unit(adverse)-qty*commission;dd=std::max(dd,(peak-worst)/peak*100.);
   if(worst<=dayStart-capital*(riskPct>.25?.04:.02))locked=true;if(worst<=peak-capital*(riskPct>.25?.12:.08))failed=true;
   if(side>0?low<=stop:askHigh>=stop){if(!finish(stop,time+59999,1))return -2;}
   else if(side>0?high>=target:askLow<=target){
    if(style==3&&!partial){double part=std::floor(qty*.5*100)/100;if(part>=.01&&qty-part>=.01){double px=rounding(entry+side*1.5*distance-side*slip,side<0),fee=part*commission,gross=side*(px-entry)*part*unit(px);bal+=gross-fee;costs+=fee;partialNet+=gross-fee;qty-=part;partial=true;}}
    if(!finish(target,time+59999,2))return -2;}
   else {
    double favorable=side>0?high-entry:entry-askLow;best=std::max(best,favorable);
    if(style==3&&!partial&&best>=1.5*distance){double part=std::floor(qty*.5*100)/100;if(part>=.01&&qty-part>=.01){double px=rounding(entry+side*1.5*distance-side*slip,side<0),fee=part*commission,gross=side*(px-entry)*part*unit(px);bal+=gross-fee;costs+=fee;partialNet+=gross-fee;qty-=part;partial=true;}}
    double proposed=stop;
    if(style==1&&best>=distance)proposed=entry+side*(2*commission/unit(entry)+2*slip);
    if(style==2&&best>=2*distance)proposed=entry+side*std::max(.5*distance,best-2*atr[i]);
    if(style==3&&partial)proposed=entry+side*(2*commission/unit(entry)+2*slip);
    if(side*(proposed-stop)>tick*.5)stopNext=rounding(proposed,side<0);
    eq=bal+side*((side>0?close:askClose)-entry)*qty*unit(side>0?close:askClose)-qty*commission;
   }
  }
  if(!side)eq=bal;peak=std::max(peak,eq);dd=std::max(dd,(peak-eq)/peak*100.);
  if(eq<=dayStart-capital*(riskPct>.25?.04:.02))locked=true;if(eq<=peak-capital*(riskPct>.25?.12:.08))failed=true;
 }
 if(side){const double*b=x+(n-1)*9;if(!finish(side>0?b[7]:b[8],b[0]+59999,7))return -2;}
 out[0]=(bal/capital-1)*100;out[1]=dd;out[2]=gains;out[3]=losses;out[4]=count;out[5]=wins;out[6]=blocked;out[7]=failed;out[8]=costs;out[9]=maxStreak;out[10]=bal;return 0;
}
