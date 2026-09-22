export default class LiveReporter {
 onTestEnd(test,result){
  console.log(`BROWSER ${result.status}: ${test.title}`);
  for(const error of result.errors)console.log(error.stack||error.message||String(error));
 }
}
