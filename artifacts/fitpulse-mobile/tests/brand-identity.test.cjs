const{test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const web=path.resolve(__dirname,'../../fitpulse');
const nativeSource=fs.readFileSync(path.resolve(__dirname,'../components/BrandMark.tsx'),'utf8');
function markFor(platform){
  const exports={};
  const jsx=(type,props)=>({type,props});
  vm.runInNewContext(ts.transpileModule(nativeSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{
    exports,require(name){
      if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};
      if(name==='react-native')return{Platform:{OS:platform}};
      if(name==='react-native-svg')return{__esModule:true,default:'svg',Circle:'circle',Path:'path',Rect:'rect'};
      throw new Error('Unexpected brand dependency '+name);
    }
  });
  return exports.BrandMark({size:24,tile:'#d6e66b',glyph:'#302b28'});
}
test('mobile web uses DOM-safe accessibility attributes without native-only props',()=>{
  const mark=markFor('web');
  assert.equal(mark.props['aria-hidden'],true);
  assert.equal('accessibilityElementsHidden'in mark.props,false);
  assert.equal('importantForAccessibility'in mark.props,false);
});
test('native platforms hide the decorative mark from accessibility independently',()=>{
  for(const platform of ['ios','android']){
    const mark=markFor(platform);
    assert.equal(mark.props.accessibilityElementsHidden,true);
    assert.equal(mark.props.importantForAccessibility,'no-hide-descendants');
  }
});
test('web, native and exported icons use exactly the same custom glyph',()=>{
  const source=fs.readFileSync(path.join(web,'src/components/BrandMark.tsx'),'utf8');
  const glyph=source.match(/BRAND_GLYPH_PATH = '([^']+)'/)[1];
  assert.equal(markFor('web').props.children.find(n=>n.type==='path').props.d,glyph);
  for(const file of ['favicon.svg','brand/gym-buddy-mark.svg','brand/gym-buddy-logo.svg','brand/gym-buddy-app-icon.svg']){
    const svg=fs.readFileSync(path.join(web,'public',file),'utf8');
    assert.equal(svg.match(/<path[^>]*\sd="([^"]+)"/)[1],glyph);
  }
});
test('installable icons have the advertised dimensions and artifact-relative URLs',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(web,'public/manifest.json'),'utf8'));
  for(const size of [192,512]){
    const icon=manifest.icons.find(i=>i.sizes===`${size}x${size}`);
    assert.ok(icon);assert.ok(icon.src.startsWith('./'));
    const png=fs.readFileSync(path.join(web,'public',icon.src));
    assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);
  }
  const native=fs.readFileSync(path.resolve(__dirname,'../assets/images/gym-buddy-icon.png'));
  assert.equal(native.readUInt32BE(16),1024);assert.equal(native.readUInt32BE(20),1024);
});
test('the same display font is bundled on web, native and the brand preview',()=>{
  const hash=buffer=>require('node:crypto').createHash('sha256').update(buffer).digest('hex');
  const font=fs.readFileSync(path.join(web,'public/brand/fonts/gym-buddy-display.ttf'));
  assert.equal(font.readUInt32BE(0),0x00010000);
  for(const file of [
    path.resolve(__dirname,'../assets/fonts/gym-buddy-display.ttf'),
    path.resolve(__dirname,'../../mockup-sandbox/public/fonts/gym-buddy-display.ttf'),
  ])assert.equal(hash(fs.readFileSync(file)),hash(font));
  const svg=fs.readFileSync(path.join(web,'public/brand/gym-buddy-logo.svg'),'utf8');
  const embedded=svg.match(/data:font\/ttf;base64,([A-Za-z0-9+/=]+)/);
  assert.ok(embedded,'The downloadable wordmark must include its display font');
  assert.equal(hash(Buffer.from(embedded[1],'base64')),hash(font));
  const layout=fs.readFileSync(path.resolve(__dirname,'../app/_layout.tsx'),'utf8');
  assert.match(layout,/GYMBuddyDisplay\s*:\s*require\(['"]\.\.\/assets\/fonts\/gym-buddy-display\.ttf['"]\)/);
});