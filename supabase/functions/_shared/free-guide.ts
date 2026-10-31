/** Source-independent product education. Live setup facts come only from the canonical lifecycle. */
export function freeGuideMessages(url:string,language='en'):string[] {
 const link=new URL(url);
 if(link.protocol!=='https:'||link.hostname!=='hashibot.app'||link.pathname!=='/vip'||link.username||link.password)throw Error('VIP_CONVERSION_PAGE_REQUIRED');
 if(!['en','so'].includes(language))throw Error('GUIDE_LANGUAGE_REQUIRED');
 const en=[
  'The next setup can develop while you are busy. VIP gives you the full eligible Crypto and Forex/Gold streams: Scalp, Intraday and Swing, with conditions, stops, targets and follow-ups. Free receives selected setups and their updates.',
  'CONDITIONAL means watch and wait. A level being touched is not an entry. Wait for the confirmation and entry update tied to that exact setup reference. Every setup has an expiry and an invalidation level.',
  'CONFIRMED means the required completed-candle condition passed. Our next-open check still checks context and the chase limit. PAPER ENTRY is the separate update that records entry. If price has run away, wait for a fresh setup rather than chasing.',
  'INVALIDATED means the original setup no longer qualifies. Cancel the unfilled idea. An opposite trade needs its own new reference, conditions and risk plan; invalidation alone is not a reversal entry.',
  'Breakout or rejection? A wick through support or resistance can fail. Our watches check the originating strategy, closed candles and available trend, volume and volatility context. A retest is required only when that strategy specifies one. No filter catches every false breakout.',
  'A BTC scalp, an altcoin swing and a gold setup need different plans. Our strategy levels use asset/timeframe volatility and structure. Paper outcomes feed future setup priority as comparable evidence builds. VIP brings the complete eligible stream and its follow-ups, so you can spend less time watching charts.'
 ];
 const so=[
  'Setup-ka xiga wuu samaysmi karaa adigoo mashquulsan. VIP waxaad ka helaysaa dhammaan setup-yada u qalma ee Crypto iyo Forex/Gold: Scalp, Intraday iyo Swing, shuruudahooda, stop, targets iyo warbixinnada dambe. Free wuxuu helaa setup-yo la xushay iyo dabagalkooda.',
  'CONDITIONAL waa sug oo la soco. Taabashada level-ku ma aha gelitaan. Sug xaqiijinta iyo fariinta gelitaanka ee leh isla tixraaca setup-ka. Setup kastaa wuxuu leeyahay waqti uu dhacayo iyo heer burinaya.',
  'CONFIRMED waxay ka dhigan tahay shuruuddii shumaca xidhmay inay gudubtay. Qiimaynta furitaanka xiga wali waxay hubisaa xaaladda suuqa iyo in qiimaha aan la daba ordin. PAPER ENTRY waa fariinta goonida ah ee gelitaanka diiwaangelisa.',
  'INVALIDATED waxay ka dhigan tahay fikraddii hore inay burburtay. Jooji gelitaan aan furmin. Ganacsi jihada kale ah wuxuu u baahan yahay tixraac cusub, shuruudo iyo qorshe khatar oo u gaar ah; burintu kaligeed ma aha amar reversal.',
  'Breakout mise rejection? Wick ka gudba support ama resistance wuu fashilmi karaa. Waxaan hubinaa istaraatijiyadda, shumacyada xidhmay iyo xogta trend, volume iyo volatility ee la heli karo. Retest waxa la sugayaa marka istaraatijiyaddu dalbato. Filter kastaa ma qaban karo breakout kasta oo been ah.',
  'BTC scalp, altcoin swing iyo gold isku qorshe ma aha. Heerarka istaraatijiyaddu waxay adeegsadaan volatility-ga asset-ka iyo timeframe-ka iyo qaabka qiimaha. Natiijooyinka paper-ku waxay caawiyaan kala hormarinta setup-yada dambe marka xog ku filan ururto. VIP wuxuu kuu keenayaa dhammaan setup-yada u qalma iyo dabagalkooda.'
 ];
 const offer=language==='so'?'HashiBot VIP · USD 29 bishii ama KES 3,500 / 30 maalmood.':'HashiBot VIP · $29/month or KES 3,500/30 days.';
 return (language==='so'?so:en).map(text=>`${text}\n\n${offer}\n${link.href}`);
}
