const fetch = require('node-fetch');
const dns = require('dns').promises;

class WebsiteStatusAgent {
  async checkStatus(url) {
    let result = { url };
    let start = Date.now();
    try {
      const response = await fetch(url, { method: 'GET', redirect: 'follow' });
      result.status = response.ok ? 'up' : 'down';
      result.ok = response.ok;
      result.statusText = response.statusText;
      result.response_code = response.status;
      result.page_load_time = Date.now() - start;
    } catch (error) {
      result.status = 'down';
      result.error = error.message;
      result.page_load_time = Date.now() - start;
      result.response_code = null;
    }
    // Get IP address
    try {
      const urlObj = new URL(url);
      const addresses = await dns.lookup(urlObj.hostname);
      result.ip_address = addresses.address;
    } catch (err) {
      result.ip_address = null;
    }
    return result;
  }
}

module.exports = WebsiteStatusAgent; 