// 添加全局变量存储搜索结果
let globalSearchResults = [];
let globalDetailedResults = [];

// 添加接口检查函数
async function checkApiAccess() {
  try {
    const response = await fetch('https://admin.zhouxiaoxiao.cn/api/mapsdata/check?data=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ');
    if (!response.ok) {
      throw new Error('API access denied');
    }
    return true;
  } catch (error) {
    console.error('API check failed:', error);
    return false;
  }
}

// 添加消息监听器
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'createSidebar') {
    // 检查是否已存在 sidebar
    const existingSidebar = document.querySelector('.maps-sidebar');
    if (!existingSidebar) {
      createSidebar();
    }
  }
});

// 创建和插入sidebar
function createSidebar() {
  const sidebar = document.createElement('div');
  sidebar.className = 'maps-sidebar';
  
  fetch(chrome.runtime.getURL('sidebar/sidebar.html'))
    .then(response => response.text())
    .then(html => {
      sidebar.innerHTML = html;
      document.body.appendChild(sidebar);
      initializeSidebarEvents();
      initializeDrag(sidebar); // 初始化拖动功能
    });
}

// 初始化sidebar事件
function initializeSidebarEvents() {
  const searchBtn = document.querySelector('#search-btn');
  const closeBtn = document.querySelector('#close-btn');
  
  searchBtn.addEventListener('click', performSearch);
  
  // 添加关闭按钮事件
  closeBtn.addEventListener('click', () => {
    const sidebar = document.querySelector('.maps-sidebar');
    if (sidebar) {
      sidebar.remove();
    }
  });

  // 初始化输入框事件
  initializeInputEvents();
}

// 修改显示 loading 函数，添加进度显示功能
function showLoading(message = '正在加载数据...', progress = null) {
  let loading = document.getElementById('global-loading-overlay');
  
  if (!loading) {
    loading = document.createElement('div');
    loading.id = 'global-loading-overlay';
    loading.innerHTML = `
      <div class="loading-overlay">
        <div class="loading-spinner"></div>
        <div class="loading-text">${message}</div>
        ${progress ? `<div class="loading-progress">${progress}</div>` : ''}
      </div>
    `;
    
    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
      #global-loading-overlay .loading-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(255, 255, 255, 0.8);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 10000;
      }
      #global-loading-overlay .loading-spinner {
        width: 50px;
        height: 50px;
        border: 5px solid #f3f3f3;
        border-top: 5px solid #4285f4;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 15px;
      }
      #global-loading-overlay .loading-text {
        color: #4285f4;
        font-size: 16px;
        font-weight: bold;
        margin-bottom: 10px;
      }
      #global-loading-overlay .loading-progress {
        color: #4285f4;
        font-size: 16px;
        font-weight: bold;
        margin-bottom: 10px;
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(loading);
  } else {
    // 更新现有 loading 的消息和进度
    const textElement = loading.querySelector('.loading-text');
    if (textElement) {
      textElement.textContent = message;
    }
    
    let progressElement = loading.querySelector('.loading-progress');
    if (progress !== null) {
      if (!progressElement) {
        progressElement = document.createElement('div');
        progressElement.className = 'loading-progress';
        loading.querySelector('.loading-overlay').appendChild(progressElement);
      }
      progressElement.textContent = progress;
    } else if (progressElement) {
      progressElement.remove();
    }
  }
}

// 隐藏 loading
function hideLoading() {
  const loading = document.getElementById('global-loading-overlay');
  if (loading) {
    loading.remove();
  }
}

// 修改显示结果数量的函数
function showResultsCount(count) {
  const resultsCountElement = document.querySelector('#results-count');
  const countNumberElement = document.querySelector('#count-number');
  const exportButton = document.querySelector('#export-btn');
  
  if (resultsCountElement && countNumberElement) {
    countNumberElement.textContent = count;
    resultsCountElement.classList.remove('hidden');
    
    // 当结果数大于0时显示导出按钮
    if (count > 0 && exportButton) {
      exportButton.classList.remove('hidden');
      exportButton.addEventListener('click', exportResults);
    } else if (exportButton) {
      exportButton.classList.add('hidden');
    }
  }
}

// 修改导出结果函数，更新文件名格式
async function exportResults() {
  try {
    showLoading();
    
    if (!globalDetailedResults || globalDetailedResults.length === 0) {
      throw new Error('没有可导出的数据');
    }

    console.log(`准备导出 ${globalDetailedResults.length} 条数据`);
    
    // 转换为CSV格式
    const headers = ['序号', '名称', '地址', '电话', '网站', '评分', '评论数', 'Google URL'];
    const csvContent = [
      headers.join(','),
      ...globalDetailedResults.map((result, index) => [
        index + 1,
        `"${(result.name || '').replace(/"/g, '""')}"`,
        `"${(result.address || '').replace(/"/g, '""')}"`,
        `"${(result.phone || '').replace(/"/g, '""')}"`,
        `"${(result.website || '').replace(/"/g, '""')}"`,
        `"${(result.rating || '').replace(/"/g, '""')}"`,
        `"${(result.reviews || '').replace(/"/g, '""')}"`,
        `"${(result.url || '').replace(/"/g, '""')}"` // 添加 URL 字段
      ].join(','))
    ].join('\n');

    // 创建并下载文件
    const blob = new Blob(['\ufeff' + csvContent], { 
      type: 'text/csv;charset=utf-8'
    });
    
    // 获取搜索参数
    const keyword = document.querySelector('#keyword').value.trim();
    const country = document.querySelector('#country').value.trim();
    const region = document.querySelector('#region').value.trim();
    
    // 生成时间戳（移除所有特殊字符）
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '');
    
    // 生成文件名
    const filename = `${timestamp}_${keyword}_${country}_${region}.csv`;
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    const successMessage = `成功导出 ${globalDetailedResults.length} 条详细数据`;
    console.log(successMessage);
    showToast(successMessage);
  } catch (error) {
    console.error('导出失败：', error);
    showToast('导出失败：' + error.message);
  } finally {
    hideLoading();
  }
}

// 添加提示消息函数
function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast-message';
  toast.textContent = message;
  
  // 添加样式
  const style = document.createElement('style');
  style.textContent = `
    .toast-message {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background-color: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 10px 20px;
      border-radius: 4px;
      z-index: 10001;
      animation: fadeInOut 3s ease;
    }
    
    @keyframes fadeInOut {
      0% { opacity: 0; }
      10% { opacity: 1; }
      90% { opacity: 1; }
      100% { opacity: 0; }
    }
  `;
  
  document.head.appendChild(style);
  document.body.appendChild(toast);
  
  // 3秒后移除提示
  setTimeout(() => {
    toast.remove();
    style.remove();
  }, 3000);
}

// 修改获取结果数量的函数
function getResultsCount() {
  // 获取结果容器
  const resultsList = document.querySelector('div[role="feed"]');
  if (!resultsList) {
    console.log('未找到结果容器');
    return 0;
  }
  
  // 获取所有结果项
  const results = [];
  
  // 直接获取地点链接
  const items = resultsList.querySelectorAll('a[href^="https://www.google.com/maps/place"]');
  console.log(`找到 ${items.length} 个地点链接`);
  
  items.forEach((item, index) => {
    try {
      // 获取父元素，通常包含更多信息
      const cardElement = item.closest('div[jsaction*="mouseover:pane"]') || 
                         item.closest('div[role="article"]') || 
                         item;
      
      // 获取名称 - 尝试多个选择器组合
      let nameElement = null;
      const nameSelectors = [
        'div.fontHeadlineSmall',
        'div[class*="fontHeadlineSmall"]',
        'div[role="heading"]',
        'div[class*="fontTitleLarge"]',
        'div[class*="header"]',
        'span[jstcache]'
      ];
      
      for (const selector of nameSelectors) {
        nameElement = cardElement.querySelector(selector);
        if (nameElement && nameElement.textContent.trim()) break;
      }
      
      const name = nameElement ? nameElement.textContent.trim() : '';
      
      // 获取地址 - 尝试多个选择器组合
      let addressElement = null;
      const addressSelectors = [
        'div.fontBodyMedium',
        'div[class*="fontBodyMedium"]',
        'div[class*="address"]',
        'div[class*="subtitle"]',
        'div[jstcache]:not([class*="fontHeadlineSmall"])'
      ];
      
      for (const selector of addressSelectors) {
        const elements = cardElement.querySelectorAll(selector);
        // 通常地址是第二个元素
        addressElement = elements[1] || elements[0];
        if (addressElement && addressElement.textContent.trim()) break;
      }
      
      const address = addressElement ? addressElement.textContent.trim() : '';
      
      // 获取完整的 aria-label
      const ariaLabel = cardElement.getAttribute('aria-label') || 
                       item.getAttribute('aria-label') ||
                       '';
      
      // 检查是否为广告
      const isAd = cardElement.innerHTML.includes('赞助') || 
                   cardElement.innerHTML.includes('Ad') ||
                   cardElement.querySelector('span[aria-label*="广告"]') ||
                   cardElement.querySelector('span[aria-label*="Ad"]');
      
      // 如果不是广告且有名称，则添加到结果集
      if (!isAd && name) {
        // 检查是否已存在相同的结果
        const isDuplicate = results.some(r => 
          r.name === name && r.address === address
        );
        
        if (!isDuplicate) {
          const result = {
            name,
            address,
            ariaLabel,
            element: cardElement, // 保存元素引用，用于后续点击
            url: item.href // 保存链接URL
          };
          
          results.push(result);
          console.log(`找到有效结果 ${results.length}:`, { name, address, url: item.href });
        }
      } else {
        console.log(`跳过结果 ${index + 1}:`, { 
          name, 
          address, 
          isAd, 
          hasName: !!name,
          elementHtml: cardElement.innerHTML.slice(0, 100) + '...' 
        });
      }
    } catch (error) {
      console.error(`处理第 ${index + 1} 个结果项时出错:`, error);
    }
  });
  
  // 更新全局变量
  globalSearchResults = results;
  console.log(`最终找到 ${results.length} 个有效结果`);
  
  return results.length;
}

// 显示错误提示
function showInputError(inputId) {
  const input = document.querySelector(`#${inputId}`);
  const errorTip = document.querySelector(`#${inputId}-error`);
  if (input && errorTip) {
    input.classList.add('error');
    errorTip.classList.add('show');
  }
}

// 隐藏错误提示
function hideInputError(inputId) {
  const input = document.querySelector(`#${inputId}`);
  const errorTip = document.querySelector(`#${inputId}-error`);
  if (input && errorTip) {
    input.classList.remove('error');
    errorTip.classList.remove('show');
  }
}

// 隐藏所有错误提示
function hideAllErrors() {
  ['keyword', 'country', 'region'].forEach(id => hideInputError(id));
}

// 修改执行搜索函数，添加API检查
async function performSearch() {
  try {
    // 先进行API检查
    // const hasAccess = await checkApiAccess();
    // if (!hasAccess) {
    //   console.log('API access check failed, search aborted');
    //   return;
    // }

    // 清空全局搜索结果
    globalSearchResults = [];
    
    // 先隐藏所有错误提示
    hideAllErrors();

    const keyword = document.querySelector('#keyword').value.trim();
    const country = document.querySelector('#country').value.trim();
    const region = document.querySelector('#region').value.trim();

    let hasError = false;

    // 检查每个字段
    if (!keyword) {
      showInputError('keyword');
      hasError = true;
    }
    if (!country) {
      showInputError('country');
      hasError = true;
    }
    if (!region) {
      showInputError('region');
      hasError = true;
    }

    if (hasError) {
      return;
    }

    const searchQuery = `${keyword} ${region} ${country}`;
    
    const searchBox = document.querySelector('input#searchboxinput');
    const searchButton = document.querySelector('button#searchbox-searchbutton');
    
    if (searchBox && searchButton) {
      try {
        // 隐藏之前的结果数量
        const resultsCountElement = document.querySelector('#results-count');
        if (resultsCountElement) {
          resultsCountElement.classList.add('hidden');
        }
        
        showLoading();
        
        // 清空搜索框
        searchBox.value = '';
        // 触发搜索框的 focus 事件
        searchBox.focus();
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // 模拟输入
        searchBox.value = searchQuery;
        // 触发 input 事件
        searchBox.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // 点击搜索按钮
        searchButton.click();
        
        // 等待搜索结果加载
        await waitForResults();
        
        // 加载所有结果
        await loadAllResults();
      } catch (error) {
        console.error('搜索过程出错：', error);
      } finally {
        hideLoading();
      }
    } else {
      console.error('未找到搜索框或搜索按钮');
      hideLoading();
    }
  } catch (error) {
    console.error('搜索过程出错：', error);
    hideLoading();
  }
}

// 修改等待搜索结果加载函数
function waitForResults() {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const maxAttempts = 10; // 改为5秒 (500ms * 10 = 5秒)
    
    const checkResults = setInterval(() => {
      attempts++;
      const resultsList = document.querySelector('div[role="feed"]');
      const loadingIndicator = document.querySelector('div[role="progressbar"]');
      
      if (resultsList && !loadingIndicator) {
        clearInterval(checkResults);
        setTimeout(resolve, 1000); // 等待额外1秒确保结果加载完成
      } else if (attempts >= maxAttempts) {
        clearInterval(checkResults);
        reject(new Error('搜索结果加载超时'));
      }
    }, 500);
  });
}

// 修改加载所有结果的函数
async function loadAllResults() {
  const resultsList = document.querySelector('div[role="feed"]');
  if (!resultsList) {
    console.log('未找到结果列表容器');
    return;
  }

  let previousCount = 0;
  let sameCountTimes = 0;
  let attempts = 0;
  
  // 获取初始结果数
  const initialCount = getResultsCount();
  console.log(`初始结果数: ${initialCount}`);
  
  // 根据初始结果数来确定最大尝试次数
  // 通常第一次加载会显示约 20 条结果
  // 后续每次滚动加载约 10-20 条
  // 设置最大尝试次数为 Math.ceil(总数 / 10)，确保能加载完所有数据
  const estimatedLoadTimes = Math.ceil(initialCount / 10);
  // 设置最大尝试次数，最少 3 次，最多 10 次
  // const maxAttempts = Math.min(Math.max(estimatedLoadTimes, 3), 10);
  const maxAttempts = 5;
  
  console.log(`预估加载次数: ${estimatedLoadTimes}, 设置最大尝试次数: ${maxAttempts}`);

  let isContinue = true;

  while (attempts < maxAttempts || isContinue) {
    attempts++;
    console.log(`尝试第 ${attempts}/${maxAttempts} 次加载`);
    
    // 滚动到底部
    await smoothScrollToBottom(resultsList);
    
    // 等待新内容加载
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 获取当前结果数
    const currentCount = getResultsCount();
    console.log(`当前结果数: ${currentCount}`);
    
    if (currentCount === 0) {
      console.log('未找到结果，等待更长时间');
      await new Promise(resolve => setTimeout(resolve, 3000));
      continue;
    }
    
    if (currentCount === previousCount) {
      sameCountTimes++;
      console.log(`结果数未变化: ${sameCountTimes} 次`);
      if (sameCountTimes >= 2) { // 连续2次未变化就停止
        console.log('连续2次结果数未变化，停止加载');
        isContinue = false;
        break;
      }
    } else {
      sameCountTimes = 0;
      previousCount = currentCount;
      console.log('发现新结果，继续加载');
    }
    
    // 检查是否出现"没有更多结果"的提示
    const noMoreResults = Array.from(document.querySelectorAll('span[role="status"]')).some(
      el => {
        const text = el.textContent.toLowerCase();
        return text.includes('没有更多结果') || 
               text.includes('no more results') ||
               text.includes('end of list');
      }
    );
    
    if (noMoreResults) {
      console.log('检测到"没有更多结果"提示，停止加载');
      break;
    }
  }

  // 滚动回顶部
  resultsList.scrollTo(0, 0);
  
  // 如果有结果，则获取详细信息
  if (globalSearchResults.length > 0) {
    await getDetailedInformation();
  }
  
  const totalResults = globalDetailedResults.length || globalSearchResults.length;
  console.log(`最终结果总数: ${totalResults}`);
  showResultsCount(totalResults);
}

// 修改获取详细信息的函数
async function getDetailedInformation() {
  console.log('开始获取详细信息');
  globalDetailedResults = [];
  
  const total = globalSearchResults.length;
  
  for (let i = 0; i < total; i++) {
    const result = globalSearchResults[i];
    try {
      // 更新加载提示，显示进度
      const progress = `正在处理第 ${i + 1}/${total} 条数据`;
      const percentage = Math.round((i + 1) / total * 100);
      showLoading('获取详细信息中...', `${progress} (${percentage}%)`);
      
      console.log(`处理第 ${i + 1}/${total} 个结果: ${result.name}`);
      
      if (result.url) {
        // 创建一个新的 iframe 来加载详情页
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
        
        // 等待 iframe 加载完成
        await new Promise((resolve, reject) => {
          iframe.onload = resolve;
          iframe.onerror = reject;
          iframe.src = result.url;
        });
        
        try {
          // 从 iframe 中获取详细信息
          const detailedInfo = await extractDetailedInfoFromIframe(iframe);
          
          if (detailedInfo) {
            globalDetailedResults.push({
              ...detailedInfo,
              originalName: result.name,
              originalAddress: result.address,
              url: result.url
            });
            console.log('成功获取详细信息:', detailedInfo);
          }
        } finally {
          // 清理 iframe
          document.body.removeChild(iframe);
        }
        
        // 等待一下，避免请求过快
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`获取第 ${i + 1} 个结果的详细信息时出错:`, error);
      // 如果获取失败，记录基本信息
      globalDetailedResults.push({
        name: result.name,
        address: result.address,
        url: result.url,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  console.log(`完成详细信息获取，共 ${globalDetailedResults.length} 条`);
}

// 修改从 iframe 中提取详细信息的函数
async function extractDetailedInfoFromIframe(iframe) {
  try {
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    
    // 获取名称
    const nameElement = doc.querySelector('h1.DUwDvf, h1.tAiQdd, div.DUwDvf');
    const name = nameElement ? nameElement.textContent.trim() : '';
    
    // 获取地址
    const addressElement = doc.querySelector('button[data-item-id*="address"], div.rogA2c');
    let address = addressElement ? addressElement.textContent.trim() : '';
    // 清理地址
    if (address) {
      // 移除 "地址: " 等前缀
      address = address.replace(/^(地址|Address|位置|Location)\s*[:：]\s*/i, '');
      // 移除复制图标文本
      address = address.replace(/复制地址|Copy address/gi, '');
      // 移除多余空格和换行
      address = address.replace(/\s+/g, ' ').trim();
    }
    
    // 获取电话
    const phoneElement = doc.querySelector('button[data-item-id*="phone"], button[data-tooltip*="电话"]');
    let phone = phoneElement ? phoneElement.textContent.trim() : '';
    // 清理电话号码
    if (phone) {
      // 移除 "电话: " 等前缀
      phone = phone.replace(/^(电话|Phone|Tel|联系电话)\s*[:：]\s*/i, '');
      // 移除复制图标文本
      phone = phone.replace(/复制电话号码|Copy phone number/gi, '');
      // 只保留数字、加号、减号和括号
      phone = phone.replace(/[^\d+\-()（）\s]/g, '');
      // 移除多余空格
      phone = phone.replace(/\s+/g, ' ').trim();
    }
    
    // 获取网站
    const websiteElement = doc.querySelector('a[data-item-id*="authority"], a[data-tooltip*="网站"]');
    const website = websiteElement ? websiteElement.href : '';
    
    // 获取评分
    const ratingElement = doc.querySelector('div.F7nice span[aria-hidden="true"], span.ceNzKf');
    const rating = ratingElement ? ratingElement.textContent.trim() : '';
    
    // 获取评论数（尝试多个选择器）
    const reviewsSelectors = [
      'button[jsaction*="pane.rating.moreReviews"]',
      'button[jsaction*="reviewChart.moreReviews"]',
      'span.HHrUdb',
      'div.F7nice > span:not([aria-hidden])',
      'span[jsan*="fontBodyMedium"]',
      'div.jANrlb > div',
      'button[aria-label*="条评价"]',
      'button[aria-label*="reviews"]'
    ];
    
    let reviews = '';
    for (const selector of reviewsSelectors) {
      const element = doc.querySelector(selector);
      if (element) {
        // 提取评论数，只保留数字
        const text = element.textContent.trim();
        const match = text.match(/\d+/);
        if (match) {
          reviews = match[0]; // 只保留数字部分
          break;
        }
      }
    }
    
    // 如果还没找到评论数，尝试从评分元素的父元素中获取
    if (!reviews && ratingElement) {
      const ratingContainer = ratingElement.closest('div.F7nice, div.jANrlb');
      if (ratingContainer) {
        const reviewsText = Array.from(ratingContainer.childNodes)
          .find(node => node.nodeType === 3)?.textContent.trim();
        if (reviewsText) {
          const match = reviewsText.match(/\d+/);
          if (match) {
            reviews = match[0]; // 只保留数字部分
          }
        }
      }
    }
    
    console.log('从 iframe 提取到的详细信息:', {
      name,
      address,
      phone,
      website,
      rating,
      reviews // 现 reviews 只包含数字
    });
    
    return {
      name,
      address,
      phone,
      website,
      rating,
      reviews, // 直接返回数字
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('从 iframe 提取详细信息时出错:', error);
    return null;
  }
}

// 修改平滑滚动函数
async function smoothScrollToBottom(element) {
  console.log('开始滚动加载');
  const scrollHeight = element.scrollHeight;
  const viewHeight = element.clientHeight;
  const scrollStep = viewHeight / 2; // 调整滚动步长
  
  for (let scrollPos = 0; scrollPos < scrollHeight; scrollPos += scrollStep) {
    element.scrollTo(0, scrollPos);
    await new Promise(resolve => setTimeout(resolve, 300)); // 增加滚动间隔
  }
  
  // 确保滚动到最底部
  element.scrollTo(0, scrollHeight);
  // 额外等待以确保内容加载
  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log('滚动加载完成');
}

// 初始化拖动功能
function initializeDrag(sidebar) {
  const dragHandle = sidebar.querySelector('.drag-handle');
  let isDragging = false;
  let startX;
  let startY;
  let startLeft;
  let startTop;

  dragHandle.addEventListener('mousedown', startDragging);
  document.addEventListener('mousemove', drag);
  document.addEventListener('mouseup', stopDragging);

  function startDragging(e) {
    // 只有点击拖动区域才开始拖动
    if (e.target.closest('.drag-handle')) {
      isDragging = true;
      
      // 记录鼠标起始位置
      startX = e.clientX;
      startY = e.clientY;
      
      // 记录窗口起始位置
      const rect = sidebar.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      
      // 添加拖动时的样式
      sidebar.style.transition = 'none';
      dragHandle.style.cursor = 'grabbing';
    }
  }

  function drag(e) {
    if (!isDragging) return;
    
    e.preventDefault();
    
    // 计算移动距离
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    
    // 计算新位置
    let newLeft = startLeft + deltaX;
    let newTop = startTop + deltaY;
    
    // 限制不超出视口范围
    const maxX = window.innerWidth - sidebar.offsetWidth;
    const maxY = window.innerHeight - sidebar.offsetHeight;
    
    newLeft = Math.max(0, Math.min(newLeft, maxX));
    newTop = Math.max(0, Math.min(newTop, maxY));
    
    // 应用新位置
    sidebar.style.left = `${newLeft}px`;
    sidebar.style.top = `${newTop}px`;
  }

  function stopDragging() {
    if (isDragging) {
      isDragging = false;
      dragHandle.style.cursor = 'move';
      sidebar.style.transition = 'box-shadow 0.3s ease';
    }
  }

  // 初始化位置（页面中间）
  sidebar.style.position = 'fixed';
  
  // 计算中心位置
  const centerX = (window.innerWidth - sidebar.offsetWidth) / 2;
  const centerY = (window.innerHeight - sidebar.offsetHeight) / 2;
  
  // 设置初始位置
  sidebar.style.left = `${centerX}px`;
  sidebar.style.top = `${centerY}px`;
  sidebar.style.right = 'auto'; // 清除右侧定位
  sidebar.style.margin = '0';
  sidebar.style.transform = 'none';
}

// 初始化输入框事件
function initializeInputEvents() {
  ['keyword', 'country', 'region'].forEach(id => {
    const input = document.querySelector(`#${id}`);
    if (input) {
      input.addEventListener('input', () => {
        if (input.value.trim()) {
          hideInputError(id);
        }
      });
    }
  });
}

// 当页面加载完成时初始化sidebar
window.addEventListener('load', () => {
  setTimeout(createSidebar, 1000);
}); 