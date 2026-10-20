// 모든 시각은 KST 24시간제 (PLAYBOOK 규칙 10)
const parts = (d) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );

export const kst = (d = new Date()) => {
  const p = parts(d);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} KST`;
};
export const kstStamp = (d = new Date()) => {
  const p = parts(d);
  return `${p.year.slice(2)}${p.month}${p.day}-${p.hour}${p.minute}${p.second}`;
};
