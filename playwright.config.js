import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./test/browser',timeout:240000,expect:{timeout:90000},workers:1,
 reporter:[['list'],['./test/browser/live-reporter.js'],['github'],['html',{open:'never'}]],
 use:{baseURL:'http://127.0.0.1:5173',viewport:{width:1100,height:760},screenshot:'only-on-failure',trace:'retain-on-failure',launchOptions:{args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}},
 webServer:{command:'npm run dev',url:'http://127.0.0.1:5173',reuseExistingServer:!process.env.CI,timeout:120000}
});
