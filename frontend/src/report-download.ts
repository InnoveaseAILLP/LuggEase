import {Platform} from 'react-native';
import {fs,media,open} from 'react-native-blob-util';
export async function saveReportCSV(csv:string,name:string) {
  const file=`${name}-${Date.now()}.csv`;const path=`${fs.dirs.CacheDir}/${file}`;
  await fs.writeFile(path,csv,'utf8');
  if(Platform.OS==='android'&&Number(Platform.Version)>=29) {
    try {await media.copyToMediaStore({name:file,parentFolder:'LuggEase',mime:'text/csv'},'Download',path);}
    finally {await fs.unlink(path).catch(()=>{});}
    return 'Report saved to Downloads / LuggEase.';
  }
  try {await open.optionsMenu(path);} catch {throw new Error('Unable to open the report. Try the web download.');}
  const files=await fs.ls(fs.dirs.CacheDir);
  await Promise.all(files.filter(f=>f.startsWith('LuggEase-Report-')&&f.endsWith('.csv')&&f!==file).map(f=>fs.unlink(`${fs.dirs.CacheDir}/${f}`).catch(()=>{})));
  return 'Use Save to Files to save the report.';
}
