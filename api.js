// ================================================================
//  工程管理系統 — 前端 API 客戶端
//  所有頁面共用，修改 API_URL 即可切換後端
// ================================================================

const API_URL = 'https://script.google.com/macros/s/AKfycbyh1n95R50EWLU3AJST65-JYLB_T9NIS8aRUS6tPpUgZKNsTLi-snJw-NNOAzGoY7OE/exec';

// ── Token 管理 ──────────────────────────────────────────────────
const Auth = {
  save(token, user) {
    sessionStorage.setItem('cm_token', token);
    sessionStorage.setItem('cm_user',  JSON.stringify(user));
  },
  getToken() { return sessionStorage.getItem('cm_token') || ''; },
  getUser()  {
    try { return JSON.parse(sessionStorage.getItem('cm_user') || 'null'); }
    catch(e) { return null; }
  },
  clear() {
    sessionStorage.removeItem('cm_token');
    sessionStorage.removeItem('cm_user');
  },
  isLoggedIn() { return !!this.getToken() && !!this.getUser(); },
  // 角色判斷
  isAdmin()    { return this.getUser()?.role === 'admin'; },
  isManager()  { return this.getUser()?.role === 'manager'; },
  isEngineer() { return this.getUser()?.role === 'engineer'; },
  isSub()      { return this.getUser()?.role === 'subcontractor'; },
};

// ── API 呼叫（fetch + no-cors fallback）─────────────────────────
async function callAPI(params) {
  // 自動帶入 token
  if (Auth.getToken() && !params.token) {
    params.token = Auth.getToken();
  }

  const qs = Object.entries(params)
    .map(([k,v]) => encodeURIComponent(k) + '=' + encodeURIComponent(
      typeof v === 'object' ? JSON.stringify(v) : v
    )).join('&');

  const url = API_URL + '?' + qs;

  // 先嘗試 fetch（follow redirects）
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
    });
    const text = await res.text();
    // Apps Script 回傳 JSONP 格式：callback({...}) 或 callback([...])
    // 用 regex 去掉 callback 名稱，只取 JSON 部分
        const match = text.match(/^[\w$]+\(([\s\S]+)\);?\s*$/);
    if (match) {
      return JSON.parse(match[1]);
    }
    // 嘗試直接解析 JSON
    return JSON.parse(text);
  } catch(e) {
    // fetch 失敗則 fallback 到 JSONP
    return jsonpCall(url);
  }
}

function jsonpCall(url) {
  return new Promise((resolve, reject) => {
    const cbName = 'cb_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const timeout = setTimeout(() => {
      delete window[cbName];
      if (script && script.parentNode) script.parentNode.removeChild(script);
      reject(new Error('API 請求逾時'));
    }, 20000);

    window[cbName] = (data) => {
      clearTimeout(timeout);
      delete window[cbName];
      if (script && script.parentNode) script.parentNode.removeChild(script);
      resolve(data);
    };

    // 把 callback 參數加進去
    const cbUrl = url + (url.includes('?') ? '&' : '?') + 'callback=' + cbName;
    const script = document.createElement('script');
    script.src = cbUrl;
    script.onerror = () => {
      clearTimeout(timeout);
      delete window[cbName];
      reject(new Error('API 網路錯誤'));
    };
    document.head.appendChild(script);
  });
}

// ── 寫入操作（透過 write action）────────────────────────────────
function writeAPI(action, data) {
  // 將所有欄位攤平成 GET 參數，避免 JSON 雙重編碼問題
  const params = { action: 'write', writeAction: action };
  Object.entries(data || {}).forEach(([k, v]) => {
    params[k] = typeof v === 'object' ? JSON.stringify(v) : v;
  });
  return callAPI(params);
}

// ── POST 上傳（用於大檔案，繞過 URL 長度限制）────────────────────
async function postAPI(data) {
  const url = API_URL;
  if (Auth.getToken() && !data.token) {
    data.token = Auth.getToken();
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      redirect: 'follow',
    });
    const text = await res.text();
    const match = text.match(/^[\w$]+\(([\s\S]+)\);?\s*$/);
    if (match) return JSON.parse(match[1]);
    return JSON.parse(text);
  } catch(e) {
    throw new Error('POST API 失敗: ' + e.message);
  }
}

// ── 各功能 API ──────────────────────────────────────────────────
const API = {
  // 登入
  login: (email, password) =>
    callAPI({ action:'login', email, password }),

  // 組織層級
  getHierarchy:   () => callAPI({ action:'getHierarchy' }),
  createRelation: (supervisorId, subordinateId) => writeAPI('createRelation', { supervisorId, subordinateId }),
  deleteRelation: (id) => writeAPI('deleteRelation', { id }),

  // 工作報告
  getReports:   (projectId) => callAPI({ action:'getReports', projectId }),
  createReport: (data) => writeAPI('createReport', data),
  updateReport: (data) => writeAPI('updateReport', data),
  deleteReport: (id)   => writeAPI('deleteReport', { id }),

  // 系統設定
  getConfig: () =>
    callAPI({ action:'getConfig' }),

  // 使用者
  getUsers: () =>
    callAPI({ action:'getUsers' }),
  createUser: (data) => writeAPI('createUser', data),
  updateUser: (data) => writeAPI('updateUser', data),
  deleteUser: (id)   => writeAPI('deleteUser', { id }),
  toggleUser: (id)   => writeAPI('toggleUser', { id }),
  changePw:   (id, password) => writeAPI('changePw', { id, password }),

  // 工程專案
  getProjects: (params={}) =>
    callAPI({ action:'getProjects', ...params }),
  createProject: (data) => writeAPI('createProject', data),
  updateProject: (data) => writeAPI('updateProject', data),
  deleteProject: (id)   => writeAPI('deleteProject', { id }),
  approveProject: (id, approved) =>
    writeAPI('approveProject', { id, approved }),
  withdrawProject: (id) =>
    writeAPI('withdrawProject', { id }),

  // 工項
  getTasks: (projectId) =>
    callAPI({ action:'getTasks', projectId }),
  createTask: (data) => writeAPI('createTask', data),
  updateTask: (data) => writeAPI('updateTask', data),
  deleteTask: (id)   => writeAPI('deleteTask', { id }),

  // 施工日誌
  getLogs: (projectId) =>
    callAPI({ action:'getLogs', projectId }),
  createLog:  (data)        => writeAPI('createLog',  data),
  reviewLog:  (id, approved) => writeAPI('reviewLog', { id, approved }),

  // 文件
  getFiles: (projectId) =>
    callAPI({ action:'getFiles', projectId }),
  uploadFile: (data) => postAPI({ action:'uploadFile', ...data }),
  deleteFile: (id)   => writeAPI('deleteFile', { id }),

  // 分包商指派
  getAssigns:   (projectId) =>
    callAPI({ action:'getAssigns', projectId }),
  createAssign: (data) => writeAPI('createAssign', data),
  deleteAssign: (id)   => writeAPI('deleteAssign', { id }),

  // 分包商公開（免 token）
  getAssign: (token) =>
    callAPI({ action:'getAssign', token }),
  subFill: (token, data) =>
    callAPI({ action:'subFill', token, data: JSON.stringify(data) }),
};

// ── 登入守衛（頁面載入時檢查）──────────────────────────────────
function requireAuth(allowedRoles) {
  if (!Auth.isLoggedIn()) {
    window.location.href = 'login.html';
    return false;
  }
  const user = Auth.getUser();
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    alert('你沒有權限存取此頁面');
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

// ── 登出 ────────────────────────────────────────────────────────
function logout() {
  Auth.clear();
  window.location.replace('login.html');
}

// ── 共用 Toast ──────────────────────────────────────────────────
let _toastTimer;
function showToast(msg, type='default') {
  let el = document.getElementById('_toast');
  if (!el) {
    el = document.createElement('div');
    el.id = '_toast';
    Object.assign(el.style, {
      position:'fixed', bottom:'24px', left:'50%',
      transform:'translateX(-50%)', padding:'10px 20px',
      borderRadius:'24px', fontSize:'13px', fontWeight:'500',
      zIndex:'9999', opacity:'0', transition:'opacity .2s',
      pointerEvents:'none', whiteSpace:'nowrap',
      boxShadow:'0 4px 16px rgba(0,0,0,.25)',
    });
    document.body.appendChild(el);
  }
  const colors = {
    default: { bg:'#1B2A3B', color:'#fff' },
    success: { bg:'#0F6E56', color:'#fff' },
    error:   { bg:'#A32D2D', color:'#fff' },
    warn:    { bg:'#854F0B', color:'#fff' },
  };
  const c = colors[type] || colors.default;
  el.style.background = c.bg;
  el.style.color = c.color;
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.style.opacity = '0', 2800);
}

// ── 共用 Loading ─────────────────────────────────────────────────
function showLoading(show, targetId) {
  const el = targetId ? document.getElementById(targetId) : null;
  if (!el) return;
  if (show) {
    el.innerHTML = `<div style="text-align:center;padding:3rem;color:#A0AEC0">
      <i class="ti ti-loader" style="font-size:28px;display:block;margin-bottom:10px;animation:spin 1s linear infinite"></i>
      載入中...
    </div>`;
    if (!document.getElementById('_spin_style')) {
      const s = document.createElement('style');
      s.id = '_spin_style';
      s.textContent = '@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}';
      document.head.appendChild(s);
    }
  }
}

// ── 檔案轉 base64 ───────────────────────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── 格式化工具 ──────────────────────────────────────────────────
const Fmt = {
  money: n => n ? '$' + Number(n).toLocaleString() : '—',
  date:  s => s ? String(s).slice(0,10) : '—',
  remain:(budget, contract) => {
    if (!budget && !contract) return null;
    return budget - contract;
  },
  diff: (real, plan) => real - plan,
  diffStr: d => d === 0 ? '—' : (d > 0 ? '+' : '') + d + '%',
  progColor: (real, plan) => {
    const d = real - plan;
    return d < -10 ? '#A32D2D' : d < 0 ? '#854F0B' : '#185FA5';
  },
};
