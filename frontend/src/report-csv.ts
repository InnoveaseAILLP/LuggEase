export function recordsCSV(rows:Record<string,unknown>[]):string {
  const keys=Array.from(new Set(rows.flatMap(row=>Object.keys(row))));
  if(!keys.length)return '\uFEFFNo records\r\n';
  const cell=(value:unknown)=>{
    let text=value==null?'':String(value);
    // Quoting alone does not prevent spreadsheet formula execution.
    if(typeof value==='string'&&(/^[\s\u0000]*[=+\-@]/.test(text)||/^[\t\r\n]/.test(text)))text="'"+text;
    return '"'+text.replace(/"/g,'""')+'"';
  };
  return '\uFEFF'+[keys.map(key=>cell(key.replace(/_paise$/,'_INR'))).join(','),
    ...rows.map(row=>keys.map(key=>cell(key.endsWith('_paise')&&typeof row[key]==='number'?Number(row[key])/100:row[key])).join(','))].join('\r\n')+'\r\n';
}
