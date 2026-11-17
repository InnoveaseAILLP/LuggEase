const path=require('path');
const {getDefaultConfig,mergeConfig}=require('@react-native/metro-config');
const root=path.resolve(__dirname,'..');
const fixtures={auth:'auth.tsx',api:'data.ts',location:'location.ts',router:'router.ts'};
module.exports=mergeConfig(getDefaultConfig(root),{projectRoot:root,resolver:{resolveRequest(context,name,platform){
 const normalized=name.replace(/\\/g,'/').replace(/\.(tsx?|jsx?)$/,'');
 for(const [key,file] of Object.entries(fixtures)){
  if(normalized.endsWith('/src/'+key)||normalized==='@/src/'+key||path.resolve(path.dirname(context.originModulePath),normalized)===path.join(root,'src',key))return {type:'sourceFile',filePath:path.join(__dirname,file)};
 }
 return context.resolveRequest(context,name,platform);
}}});
