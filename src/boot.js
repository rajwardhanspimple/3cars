import('./main.js').catch(error => {
  console.error(error);
  document.querySelector('#menu').hidden=true;
  document.querySelector('#error').hidden=false;
  document.querySelector('#error-message').textContent=error.message || 'Reload the page. If the problem continues, enable hardware acceleration in your browser.';
});
