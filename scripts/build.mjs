import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root=process.cwd(),dist=join(root,'dist');
await rm(dist,{recursive:true,force:true});
await mkdir(join(dist,'src'),{recursive:true});
await cp(join(root,'src'),join(dist,'src'),{recursive:true});
await cp(join(root,'public'),dist,{recursive:true});

const html=await readFile(join(root,'index.html'),'utf8');
await writeFile(join(dist,'index.html'),html);

const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const release={
  app:'CareerLaunch SA',
  version:pkg.version,
  build_id:process.env.GITHUB_SHA||process.env.COMMIT_REF||process.env.DEPLOY_ID||'local',
  generated_at:new Date().toISOString()
};
await writeFile(join(dist,'release.json'),JSON.stringify(release,null,2)+'\n');

console.log(`Built CareerLaunch SA static release in dist/ (${release.build_id})`);
