document.getElementById('visit-website').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://www.zhouxiaoxiao.cn/' });
});

document.getElementById('start-work').addEventListener('click', async () => {
  // 获取当前标签页
  const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  // 检查当前页面是否是 Google Maps
  if (currentTab.url.includes('google.com/maps')) {
    // 如果是 Google Maps，注入脚本创建 sidebar
    chrome.tabs.sendMessage(currentTab.id, { action: 'createSidebar' });
  } else {
    // 如果不是，创建新的 Google Maps 标签页
    chrome.tabs.create({ url: 'https://www.google.com/maps/' });
  }
}); 