'use strict';
// Cocos Creator 3.8.x rejects JS constructors for primitive metadata and
// warns about explicit scalar ValueType metadata when a concrete default exists.
// Check actual AST, not comments, strings or TypeScript type annotations.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const forbidden=new Set(['Number','Boolean','String','Array','Object','Function','BigInt','Symbol','number','boolean','string','undefined','null']);
const valueTypes=new Set(['Vec2','Vec3','Vec4','Quat','Color','Mat3','Mat4','Size','Rect']);
const errors=[],types=new Map();
let files=0,properties=0;
function inspect(file,source){
 const src=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 const issue=(node,msg)=>errors.push(file+':'+(src.getLineAndCharacterOfPosition(node.getStart(src)).line+1)+' '+msg);
 function visit(n){
  for(const d of ts.canHaveDecorators(n)?ts.getDecorators(n)||[]:[]){
   const expr=d.expression,call=ts.isCallExpression(expr)?expr:null;
   const name=(call?.expression||expr).getText(src);
   if(!/^(property|_decorator\.property|type|_decorator\.type)$/.test(name))continue;
   properties++;
   const a=call?.arguments[0];
   const option=a&&ts.isObjectLiteralExpression(a)?a.properties.find(p=>p.name?.getText(src)==='type'||p.name?.getText(src)==='"type"'||p.name?.getText(src)==="'type'"):undefined;
   const explicit=option?.initializer||(a&&!ts.isObjectLiteralExpression(a)?a:undefined);
   const field=n.name?.getText(src)||'?';
   if(call&&!a)issue(d,field+': empty @property() call; specify metadata or use bare @property with inferable default.');
   if(explicit){
    const check=node=>{
     if(ts.isArrayLiteralExpression(node)){
      if(node.elements.length!==1)issue(d,field+': array metadata must contain exactly one element type.');
      for(const element of node.elements)check(element);
     }else if(forbidden.has(node.getText(src))||/^cc\.(Number|Boolean|String|Array|Object|Function)$/.test(node.getText(src)))
      issue(d,field+': use Cocos CCFloat/CCInteger/CCBoolean/CCString instead of '+node.getText(src));
    };
    check(explicit);
    // Cocos infers a scalar ValueType from its instantiated default. Keep
    // explicit element metadata for arrays, and types for nullable references.
    if(ts.isPropertyDeclaration(n)&&n.initializer&&!ts.isArrayLiteralExpression(explicit)&&
       valueTypes.has(explicit.getText(src).replace(/^cc\./,''))&&
       n.initializer.kind!==ts.SyntaxKind.NullKeyword&&n.initializer.getText(src)!=='undefined')
      issue(d,field+': redundant ValueType metadata; use @property or @property({tooltip:...}) with an instantiated default.');
    if(ts.isPropertyDeclaration(n)&&n.initializer&&ts.isArrayLiteralExpression(n.initializer)&&!ts.isArrayLiteralExpression(explicit))
      issue(d,field+': array default requires array property type.');
    if(ts.isPropertyDeclaration(n)&&ts.isArrayLiteralExpression(explicit)&&n.initializer&&!ts.isArrayLiteralExpression(n.initializer))
      issue(d,field+': array property must have an array default.');
    types.set(file+'#'+field,explicit.getText(src));
   }else if(ts.isPropertyDeclaration(n)&&(!n.initializer||ts.isArrayLiteralExpression(n.initializer)||n.initializer.kind===ts.SyntaxKind.NullKeyword||n.initializer.getText(src)==='undefined')){
    issue(d,field+': array/null/undefined or absent default requires explicit type metadata.');
   }
  }
  ts.forEachChild(n,visit);
 }
 visit(src);
}
function walk(dir){
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const p=path.join(dir,entry.name);
  if(entry.isDirectory())walk(p);
  else if(entry.name.endsWith('.ts')&&!entry.name.endsWith('.d.ts')){
   files++;inspect(path.relative(root,p).split(path.sep).join('/'),fs.readFileSync(p,'utf8'));
  }
 }
}
for(const dir of ['assets','docs/examples','examples/installable'])walk(path.join(root,dir));
const html=fs.readFileSync(path.join(root,'docs/pages/train.html'),'utf8');
let snippet=0;
for(const m of html.matchAll(/<pre><code>([\s\S]*?)<\/code><\/pre>/g)){
 const code=m[1].replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"');
 if(code.includes('@property'))inspect('docs/pages/train.html#snippet'+(++snippet),code);
}
assert(files>=90&&properties>=400,'Decorator scan coverage unexpectedly dropped');
assert.deepEqual(errors,[],'Invalid serialized property metadata:\n'+errors.join('\n'));
for(const [key,expected] of [
 ['assets/splines/Components/SplineObjectController.ts#prefabWeights','[CCFloat]'],
 ['assets/splines/Components/SplineTrafficController.ts#greenExits','[CCInteger]'],
 ['assets/splines/Components/SplineTrafficController.ts#conflictRoadHalfWidths','[CCFloat]'],
 ['docs/examples/TrainSingleSpline.ts#wrapClosed','CCBoolean'],
 ['docs/examples/TrainRouteConsist.ts#backwards','CCBoolean'],
 ['docs/examples/TrainRouteConsist.ts#loopRoute','CCBoolean'],
 ['docs/examples/TrainRouteConsist.ts#playOnStart','CCBoolean'],
])assert.equal(types.get(key),expected,key);
assert.equal(snippet,2,'Both Train code samples must be audited');
// Synthetic cases ensure the new guard catches both decorator syntaxes but
// preserves required array metadata and nullable reference metadata.
const saved=properties,errorsBefore=errors.length;
inspect('value-type-fixture.ts',`
 class Example {
  @property({type:Vec3,tooltip:'bad'}) redundant=new Vec3();
  @property(Color) redundantColor=new Color();
  @_decorator.property({type:cc.Quat}) redundantQuat=new cc.Quat();
  @property({tooltip:'ok'}) position=new Vec3();
  @property tint=new Color();
  @property({type:[Vec3]}) samples:Vec3[]=[];
  @property({type:Vec3}) nullable:Vec3|null=null;
  @property({type:Node}) target:Node|null=null;
  @property({type:[CCFloat]}) weights:number[]=[];
 }
`);
assert.equal(errors.length-errorsBefore,3,'Only redundant scalar metadata should fail');
assert(errors.slice(errorsBefore).every(msg=>msg.includes('redundant ValueType metadata')));
errors.length=errorsBefore;properties=saved;
console.log('COCOS PROPERTY TYPES PASS: '+files+' TypeScript files, '+properties+' decorators including Train HTML examples.');
