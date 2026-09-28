// Chinese labels for tool-result field names (shared by ToolDataView and the rich tool views).
export const LABELS: Record<string, string> = {
  targetYear: '目标年份', targetMonth: '目标月份', targetDate: '目标日期', date: '日期',
  birthDate: '出生日期', birthTime: '出生时间', gender: '性别', dayMaster: '日主',
  dayMasterWuXing: '日主五行', flowYearGanZhi: '流年干支', flowYearNaYin: '流年纳音',
  flowYearTenGod: '流年十神', flowYearShenSha: '流年神煞', flowMonthGanZhi: '流月干支',
  flowMonthNaYin: '流月纳音', flowMonthTenGod: '流月十神', natalDayMaster: '本命日主',
  natalPillars: '本命四柱', currentDaYun: '当前大运', daYun: '大运序列',
  year: '年柱', month: '月柱', day: '日柱', hour: '时柱', gan: '天干', zhi: '地支',
  ganZhi: '干支', naYin: '纳音', tenGod: '十神', shenSha: '神煞', wuXingAnalysis: '五行分析',
  facingDegree: '朝向度数', birthYear: '出生年份', question: '所问之事', surname: '姓氏', givenName: '名字',
  counts: '五行计数', element: '五行', count: '数量', status: '旺衰', value: '数值', name: '名称',
  type: '类型', startAge: '起始年龄', endAge: '结束年龄', startYear: '起始年份', endYear: '结束年份',
  palace: '宫位', palaces: '宫位', stars: '星曜', majorStars: '主星', minorStars: '辅星',
  heavenlyStem: '天干', earthlyBranch: '地支', direction: '方位', score: '评分', summary: '概要',
  description: '说明', interpretation: '解读', advice: '建议', luck: '吉凶', category: '类别',
  birthInfo:'出生信息', solarDate:'公历', lunarDate:'农历', solarTime:'出生时间', jieQi:'节气', jieQiInfo:'节气信息',
  shengXiao:'生肖', ganWuXing:'天干五行', zhiWuXing:'地支五行', ganTenGod:'天干十神', zhiTenGods:'地支十神', hideGan:'藏干',
  hideGanDetail:'藏干详情', wuXing:'五行', naYinWuXing:'纳音五行', xunKong:'旬空', diShi:'地势', ziZuo:'自坐',
  wuXingPairs:'五行', dayMasterStrength:'日主强弱', taiYuan:'胎元', taiYuanNaYin:'胎元纳音', taiXi:'胎息', taiXiNaYin:'胎息纳音',
  mingGong:'命宫', mingGongNaYin:'命宫纳音', shenGong:'身宫', shenGongNaYin:'身宫纳音', jiShen:'吉神', xiongSha:'凶煞',
  zhiXing:'值星', tianShen:'天神', tianShenType:'天神类型', tianShenLuck:'天神吉凶', timeTianShen:'时天神', timeTianShenType:'时天神类型',
  timeTianShenLuck:'时天神吉凶', pengZuGan:'彭祖干忌', pengZuZhi:'彭祖支忌', pengZu:'彭祖百忌', dayChong:'日冲', dayChongDesc:'日冲',
  daySha:'日煞', timeChong:'时冲', timeChongDesc:'时冲', timeSha:'时煞', dayLu:'日禄', dayPosition:'日方位',
  xi:'喜神', xiDesc:'喜神方位', yangGui:'阳贵', yangGuiDesc:'阳贵方位', yinGui:'阴贵', yinGuiDesc:'阴贵方位',
  fu:'福神', fuDesc:'福神方位', cai:'财神', caiDesc:'财神方位', nineStar:'九星', xiu:'二十八宿',
  xiuLuck:'星宿吉凶', xiuSong:'星宿歌诀', zheng:'七政', animal:'动物', gong:'四宫', shou:'四兽',
  dayYi:'日宜', dayJi:'日忌', timeYi:'时宜', timeJi:'时忌', dayPositionTai:'胎神', dayGanZhi:'日干支',
  chineseDate:'干支纪年', timeRange:'时段', sign:'星座', zodiac:'生肖', fiveElementsClass:'五行局', earthlyBranchOfSoulPalace:'命宫地支',
  earthlyBranchOfBodyPalace:'身宫地支', index:'序号', isBodyPalace:'身宫', isBody:'身宫', brightness:'亮度', scope:'范围',
  adjectiveStars:'杂曜', changsheng12:'长生十二神', boshi12:'博士十二神', jiangqian12:'将前十二神', suiqian12:'岁前十二神', decadal:'大限',
  range:'范围', ages:'小限年龄', mutagen:'四化', siHua:'四化', lu:'化禄', quan:'化权',
  ke:'化科', ji:'化忌', dailyPalaces:'流日宫位', natalStars:'本命星曜', flowStars:'流运星曜', flowMutagen:'流运四化',
  yearly:'流年', monthly:'流月', daily:'流日', palaceMapping:'宫位对照', flowMonthShenSha:'流月神煞', flowDayGanZhi:'流日干支',
  flowDayNaYin:'流日纳音', flowDayTenGod:'流日十神', flowDayShenSha:'流日神煞', yearGanZhi:'年干支', months:'各月', method:'起卦方式',
  castId:'卦例编号', timestamp:'起卦时间', monthGanZhi:'月建', upperGua:'上卦', lowerGua:'下卦', symbol:'卦象',
  nature:'属性', gua64Name:'卦名', dongYao:'动爻', dongYaoList:'动爻', bianGua:'变卦', palaceWuXing:'卦宫五行',
  yaoLines:'六爻', position:'爻位', coinValue:'钱数', yinYang:'阴阳', changedYinYang:'变爻阴阳', isDong:'动爻',
  liuQin:'六亲', diZhi:'地支', liuShen:'六神', isShi:'世爻', isYing:'应爻', shiYao:'世爻',
  yingYao:'应爻', number:'起卦数', tiGua:'体卦', yongGua:'用卦', tiYongRelation:'体用关系', yearStar:'年盘',
  monthStar:'月盘', dayStar:'日盘', timeStar:'时盘', qiMen:'九星', baMen:'八门', color:'颜色',
  taiYi:'太乙', overallLuck:'综合吉凶', shichen:'十二时辰', chong:'冲', sha:'煞', yi:'宜',
  fullName:'姓名', surnameStrokes:'姓氏笔画', givenStrokes:'名字笔画', tianGe:'天格', renGe:'人格', diGe:'地格',
  zongGe:'总格', waiGe:'外格', meaning:'含义', sanCai:'三才', tian:'天', ren:'人',
  di:'地', desc:'说明', natalSiHua:'生年四化', mutations:'四化', mutation:'四化', selfMutations:'自化',
  doubleJi:'双忌', sources:'来源', luJiConflict:'禄忌交驰', palaceA:'宫位甲', palaceB:'宫位乙', palaceFlyingStars:'宫干飞化',
  flies:'飞化', sittingDegree:'坐山度数', sittingMountain:'坐山', facingMountain:'朝向', sittingGua:'坐卦', facingGua:'向卦',
  houseGroup:'宅命', directions:'方位', gua:'卦', mingGua:'命卦', mingGuaGroup:'命卦分组', mingGuaMatch:'宅命相配',
  period:'元运', yuan:'三元', facing:'向', sitting:'坐', specialPatterns:'特殊格局', overview:'总览',
  personality:'性格', career:'事业', wealth:'财运', relationship:'感情', health:'健康', dayun:'大运',
};
export const TOKENS: Record<string, string> = {
  original:'原始', corrected:'校正', fortune:'条文', duanyu:'断语', info:'信息', detail:'详情',
  current:'当前', flow:'流', year:'年', month:'月', day:'日', time:'时辰', birth:'出生', target:'目标',
  gan:'干', zhi:'支', god:'十神', gods:'神煞', star:'星曜', stars:'星曜', palace:'宫位', palaces:'宫位',
  heavenly:'天', earthly:'地', stem:'干', branch:'支', wuxing:'五行', analysis:'分析', result:'结果',
  score:'评分', level:'等级', strength:'强弱', dominant:'最旺', missing:'缺失', distribution:'分布',
  start:'起始', end:'结束', age:'年龄', direction:'方位', degree:'度数', gender:'性别', name:'名称',
  element:'五行', count:'数量', counts:'计数', status:'旺衰', value:'数值', type:'类型', class:'类别',
  description:'说明', interpretation:'解读', advice:'建议', summary:'概要', category:'类别', luck:'吉凶',
  natal:'本命', master:'日主', pillars:'四柱', pillar:'柱', major:'主', minor:'辅', body:'身宫', soul:'命主',
};
export function labelFor(key: string): string {
  if (LABELS[key]) return LABELS[key];
  if (/[^\x00-\x7F]/.test(key)) return key; // already Chinese (e.g. 分析对象、甲方)
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase().split(/\s+/);
  const translated = words.map(word => TOKENS[word] || '').filter(Boolean).join('');
  return translated || '其他信息';
}
export function scalar(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (value === true) return '是';
  if (value === false) return '否';
  if (value === 'male') return '男';
  if (value === 'female') return '女';
  return String(value);
}
