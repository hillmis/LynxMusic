/**
 * DxxSystem Core Module v5.5
 * Added: VPN/Packet Capture detection & Strict Signature Enforcement
 */
(function (window, document) {
    'use strict';

    // --- 配置常量 ---
    const CONFIG = {
        // 安全配置
        SECURITY: {
            OFFICIAL_SIGNATURE: '0D6E54A998BDBE9C9A162FCD398D3912',
            ERROR_PAGE: '404.html', // 签名错误或抓包时跳转的页面
            CHECK_TIMEOUT: 3000
        },
        // 更新配置
        UPDATE: {
            HOST: 'https://raw.gitmirror.com/hillmis/versionControl/main',
            CHECK_INTERVAL: 3000000,
            MIN_VISIBLE_CHECK: 2000
        },
        // 接口
        API: {
            HITOKOTO: 'https://www.wudada.online/Api/ScSj'
        },
        // 资源
        ASSETS: {
            ALIPAY: 'https://s3.bmp.ovh/imgs/2025/05/07/1565fff5085e314b.png',
            WECHAT: 'https://s3.bmp.ovh/imgs/2025/05/07/44ac595a875326bb.png'
        }
    };

    class SystemApp {
        constructor() {
            // 初始化状态
            this.state = {
                localCode: typeof webapp !== 'undefined' ? webapp.getcode() : '1',
                currentSign: typeof webapp !== 'undefined' ? webapp.getsign() : '',
                currentVersion: typeof webapp !== 'undefined' ? webapp.getpage() : '1.0.0',
                appName: typeof webapp !== 'undefined' ? webapp.getname() : 'LynxMusic',
                latestUpdateData: null,
                lastCheckTimestamp: 0,
                hitokoto: '天若有情天亦老，人间正道是沧桑'
            };

            // 绑定上下文
            this.handleImageClick = this.handleImageClick.bind(this);
            this.checkUpdate = this.checkUpdate.bind(this);
            this.openSponsor = this.openSponsor.bind(this);
            this.handleCancelUpdate = this.handleCancelUpdate.bind(this);

            // 初始化
            this._initSecurity(); // 优先执行安全检查
            this._initHooks();

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this._onReady());
            } else {
                this._onReady();
            }
        }

        // --- 生命周期 ---
        _onReady() {
            this._fetchHitokoto();
            this._initVisibilityListener();
            this._verifyIntegrity(); // 再次校验，防止初始化时DOM未加载导致校验跳过
        }

        _initHooks() {
            window.handleImageClick = this.handleImageClick;
            if (typeof webapp !== 'undefined') {
                try { webapp.lasting("handleImageClick"); } catch (e) { }
            }
        }

        _initVisibilityListener() {
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    if (this.state.latestUpdateData?.forceUpdate && typeof webapp !== 'undefined') {
                        webapp.secede();
                    }
                } else {
                    const timeSinceLastCheck = Date.now() - this.state.lastCheckTimestamp;
                    if (timeSinceLastCheck > CONFIG.UPDATE.MIN_VISIBLE_CHECK) {
                        // this.checkUpdate();
                    }
                }
            });
        }

        // --- 安全模块 (核心修改) ---
        _initSecurity() {
            this._verifyIntegrity();
        }

        _verifyIntegrity() {
            // 1. VPN / 抓包检测 (新增)
            if (typeof webapp !== 'undefined') {
                try {
                    // 调用原生接口判断抓包/VPN状态
                    // 对应 nativeBridge.ts 中的: raw?.['判断抓包状态']?.()
                    if (webapp['判断抓包状态'] && webapp['判断抓包状态']()) {
                        this._handleTampering('非法环境：检测到VPN或抓包代理');
                        // 发现抓包立即跳转 404 或退出
                        window.location.replace(CONFIG.SECURITY.ERROR_PAGE);
                        return false;
                    }
                } catch (e) {
                    // 忽略接口不存在的错误，兼容旧版本
                }
            }

            // 2. 调试模式检测
            if (typeof window.devtools === 'object' || window.outerWidth - window.innerWidth > 100) {
                this._handleTampering('调试模式检测');
            }

            // 3. 签名校验 (修改：不匹配则强制跳转)
            try {
                if (this.state.currentSign && this.state.currentSign !== CONFIG.SECURITY.OFFICIAL_SIGNATURE) {
                    console.warn(`[Security] Signature Mismatch! Expected: ${CONFIG.SECURITY.OFFICIAL_SIGNATURE}, Got: ${this.state.currentSign}`);
                    // 强制跳转到 404 页面
                    window.location.replace(CONFIG.SECURITY.ERROR_PAGE);
                    return false;
                }
                return true;
            } catch (e) {
                this._handleTampering('校验异常');
                return false;
            }
        }

        _handleTampering(reason) {
            console.warn(`[安全警报] ${reason}`);
            if (typeof webapp !== 'undefined') {
                webapp.toast(`安全警告: ${reason}`);
            }
        }

        // --- 数据获取模块 ---
        _fetchHitokoto() {
            const fetchPoem = () => {
                return fetch(CONFIG.API.HITOKOTO)
                    .then(res => res.ok ? res.json() : Promise.reject())
                    .then(data => {
                        const text = data.data || this.state.hitokoto;
                        return text.length > 12 ? fetchPoem() : text;
                    })
                    .catch(() => this.state.hitokoto);
            };

            fetchPoem().then(text => {
                this.state.hitokoto = text;
                const poemEl = document.querySelector('.poem-text');
                if (poemEl) poemEl.textContent = text;
            });
        }

        // --- 更新模块 ---
        _compareVersions(local, remote) {
            const currentNum = Number(local);
            const latestNum = Number(remote);
            if (isNaN(currentNum) || isNaN(latestNum)) return false;
            return latestNum > currentNum;
        }

        async checkUpdate() {
            try {
                const hub = CONFIG.UPDATE.HOST.replace(/\/$/, '');
                const appName = this.state.appName;
                const safeAppName = encodeURIComponent(appName);
                const updateUrl = `${hub}/${safeAppName}.json`;

                console.log(`[Update] Checking: ${updateUrl}`);

                const response = await fetch(updateUrl + `?t=${Date.now()}`);
                if (!response.ok) throw `HTTP错误: ${response.status}`;

                const data = await response.json();
                if (!data.versionCode || !data.versionName) {
                    throw '无效的版本数据格式';
                }

                const localCode = this.state.localCode;
                const serverCode = data.versionCode;

                console.log('版本检查:', `本地:${localCode}`, `服务器:${serverCode}`);

                if (this._compareVersions(localCode, serverCode)) {
                    this._createUpdateDialog();
                    this._showUpdateUI(data);
                } else {
                    if (typeof webapp !== 'undefined') webapp.toast('版本检查: 已是最新版本');
                    else console.log('已是最新版本');
                }
            } catch (error) {
                console.error('更新检查失败:', error);
                if (typeof webapp !== 'undefined') webapp.toast('检查更新失败');
            } finally {
                this.state.lastCheckTimestamp = Date.now();
            }
        }

        _createUpdateDialog() {
            if (document.getElementById('updateOverlay')) return;
            const dialog = document.createElement('div');
            dialog.innerHTML = `
        <div id="updateOverlay" style="display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100dvh; background: rgba(0,0,0,0.5); z-index: 9999; backdrop-filter: blur(4px); padding: 20px; box-sizing: border-box; display: flex; justify-content: center; align-items: center;">
            <div style="background: #ffffff; width: min(95%, 480px); height: 70vh; max-height: 600px; min-height: 350px; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); overflow: hidden; display: flex; flex-direction: column; animation: modalSlide 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);">
                <div style="padding: 24px; background: #fff; border-bottom: 1px solid #f0f0f0; flex-shrink: 0;">
                    <div style="display: flex; align-items: center; gap: 16px; color: #1f2937;">
                        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #29c961, #22a350); border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 4px 12px rgba(41, 201, 97, 0.3);">
                            <svg viewBox="0 0 24 24" width="28" height="28" style="fill: currentColor"><path d="M14.8 3.8l2.6 5.1 5.8.9c.6.1.8.8.4 1.2l-4.2 4.3 1 5.7c.1.6-.5 1.1-1.1.8L12 18.3l-5 2.7c-.6.3-1.2-.2-1.1-.8l1-5.7-4.2-4.3c-.4-.4-.2-1.1.4-1.2l5.8-.9 2.6-5.1c.3-.6 1.1-.6 1.4 0z"/></svg>
                        </div>
                        <div>
                            <h3 style="margin: 0; font-size: 1.25rem; font-weight: 700; color: #111;">发现新版本</h3>
                            <p style="margin: 4px 0 0 0; font-size: 0.85rem; color: #666;">建议您立即更新</p>
                        </div>
                    </div>
                </div>
                <div id="updateContent" style="flex: 1; padding: 24px; overflow-y: auto; scrollbar-width: thin; background: #fff;"></div>
                <div style="padding: 20px 24px; background: #fff; border-top: 1px solid #f0f0f0; display: flex; gap: 12px; justify-content: flex-end; flex-shrink: 0;">
                    <button id="updateCancel" style="padding: 12px 24px; background: #f5f7fa; border: none; border-radius: 10px; color: #5c6b7f; font-weight: 600; cursor: pointer;">稍后再说</button>
                    <button id="updateConfirm" style="padding: 12px 32px; background: #29c961; border: none; border-radius: 10px; color: white; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(41, 201, 97, 0.25);">立即更新</button>
                </div>
            </div>
        </div>
        <style>@keyframes modalSlide { from { opacity: 0; transform: scale(0.95) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } } #updateContent::-webkit-scrollbar { width: 6px; } #updateContent::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 10px; }</style>`;
            document.body.appendChild(dialog);
            document.getElementById('updateCancel').addEventListener('click', () => this.handleCancelUpdate());
        }

        handleCancelUpdate() {
            const el = document.getElementById('updateOverlay');
            if (el) el.style.display = 'none';
            if (typeof webapp !== 'undefined') webapp.toast('已延迟更新');
            this.state.lastCheckTimestamp = Date.now();
        }

        _showUpdateUI(data) {
            this.state.latestUpdateData = data;
            const overlay = document.getElementById('updateOverlay');
            const content = document.getElementById('updateContent');

            content.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.03); padding: 12px 15px; border-radius: 10px; margin-bottom: 15px;">
                    <div style="text-align: center;">
                        <div style="font-size: 11px; color: #888;">当前版本</div>
                        <div style="font-size: 14px; color: #333; font-weight: bold;">v${this.state.currentVersion}</div>
                    </div>
                    <div style="color: #666;">➔</div>
                    <div style="text-align: center;">
                        <div style="font-size: 11px; color: #888;">最新版本</div>
                        <div style="font-size: 14px; color: #29c961; font-weight: bold;">v${data.versionName}</div>
                    </div>
                </div>
                <div style="font-size: 14px; line-height: 1.6; color: #444; white-space: pre-wrap;">${data.description.replace(/\n/g, '<br>')}</div>
                ${data.forceUpdate ? `<div style="margin-top: 15px; padding: 10px; background: #fff1f0; border-radius: 8px; color: #ff4d4f; font-size: 12px;">本次为强制更新</div>` : ''}
            `;

            if (data.forceUpdate) {
                const cancelBtn = document.getElementById('updateCancel');
                if (cancelBtn) cancelBtn.style.display = 'none';
            } else {
                document.getElementById('updateCancel').style.display = 'block';
            }

            const confirmBtn = document.getElementById('updateConfirm');
            confirmBtn.onclick = () => {
                this._checkPermissionAndDownload(data.downloadUrl);
                overlay.style.display = 'none';
            };
            overlay.style.display = 'flex';
        }

        async _checkPermissionAndDownload(url) {
            try {
                if (typeof webapp !== 'undefined') {
                    if (!webapp.bestow()) {
                        webapp.rights();
                    }
                    webapp.browse(url);
                } else {
                    window.open(url, '_blank');
                }
            } catch (error) {
                console.error('下载失败:', error);
            }
        }

        openSponsor() {
            const oldPopup = document.getElementById('SponsorPopup');
            if (oldPopup) oldPopup.remove();

            const popup = document.createElement('div');
            popup.id = 'SponsorPopup';
            popup.style.display = 'none';
            popup.style.opacity = '0';
            popup.className = 'popup-container';

            popup.innerHTML = `
        <style>
            .popup-container { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 9999; background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(5px); display: flex; justify-content: center; align-items: center; transition: all 0.3s; }
            .content-container { background: rgba(30, 30, 30, 0.95); width: 85%; max-width: 400px; border-radius: 20px; padding: 30px 20px; display: flex; flex-direction: column; align-items: center; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5); transform: scale(0.95); transition: all 0.3s; border: 1px solid rgba(255,255,255,0.1); }
            .popup-container[style*="opacity: 1"] .content-container { transform: scale(1); }
            .logo-box-animated { width: 70px; height: 70px; border-radius: 18px; overflow: hidden; margin-bottom: 12px; box-shadow: 0 8px 20px rgba(0,0,0,0.3); animation: floatLogo 3s ease-in-out infinite; }
            @keyframes floatLogo { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
            .popup-title { font-size: 20px; color: #fff; font-weight: 700; margin: 0; }
            .poem-text { text-align: center; color: rgba(255,255,255,0.5); font-size: 13px; font-style: italic; margin-bottom: 15px; font-family: serif; }
            .Sponsor-list-item { background: rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 12px 15px; width: 100%; box-sizing: border-box; display: flex; align-items: center; cursor: pointer; transition: 0.2s; margin-bottom: 8px; }
            .Sponsor-list-item:active { transform: scale(0.98); background: rgba(255,255,255,0.1); }
            .donate-section { margin-top: 15px; padding-top: 20px; border-top: 1px dashed rgba(255,255,255,0.1); width: 100%; text-align: center; }
            .qr-container { display: flex; justify-content: center; gap: 20px; margin-top: 15px; }
            .qr-img-wrapper { width: 90px; height: 90px; background: #fff; padding: 5px; border-radius: 10px; cursor: pointer; transition: 0.2s; }
            .qr-img-wrapper:active { opacity: 0.8; transform: scale(0.95); }
            .qr-img { width: 100%; height: 100%; object-fit: contain; }
            .qr-label { font-size: 12px; font-weight: bold; margin-top: 5px; }
        </style>
        
        <div class="content-container">
            <div class="Sponsor-logo-section" style="display:flex;flex-direction:column;align-items:center;">
                <div class="logo-box-animated">
                    <img src="logo.png" alt="Logo" style="width: 100%; height: 100%; object-fit: cover;">
                </div>
                <h2 class="popup-title">${this.state.appName}</h2>
            </div>

            <div class="text-container" style="width:100%;">
                <div class="poem-text">${this.state.hitokoto}</div>
                
                <div class="Sponsor-list-group">
                    <div class="Sponsor-list-item">
                        <div style="color:#eee;">
                            <div style="font-size:14px;font-weight:500;">Hillmis</div>
                            <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:2px;">
                                我是一个前端和UI设计爱好者，用AI编程工具实现心中想法，为大家带来免费好用的软件，希望在实现自己灵光一现的奇思妙想的同时可以给您带来方便和乐趣。
                            </div>
                        </div>
                    </div>
                    <div class="Sponsor-list-item" id="visitAuthorBtn" style="justify-content:center;">
                        <div style="font-size:12px;color:rgba(255,255,255,0.7);">点击发现更多奇思妙想</div>
                    </div>
                </div>

                <div class="donate-section">
                    <div style="color:#ccc;font-size:13px;font-weight:500;">☕ 请开发者喝杯咖啡支持一下</div>
                    
                    <div class="qr-container">
                        <div style="display:flex;flex-direction:column;align-items:center;">
                            <div class="qr-img-wrapper" id="alipayQr"><img src="${CONFIG.ASSETS.ALIPAY}" class="qr-img"></div>
                            <div class="qr-label" style="color: #1677ff;">支付宝</div>
                        </div>
                        
                        <div style="display:flex;flex-direction:column;align-items:center;">
                            <div class="qr-img-wrapper" id="wechatQr"><img src="${CONFIG.ASSETS.WECHAT}" class="qr-img"></div>
                            <div class="qr-label" style="color: #07c160;">微信</div>
                        </div>
                    </div>
                    
                    <p style="text-align:center;color:rgba(255,255,255,0.3);font-size:11px;margin-top:15px;">点击图片保存赞赏码 · 感谢您的支持</p>
                </div>
            </div>
        </div>`;

            document.body.appendChild(popup);

            popup.addEventListener('click', (e) => {
                if (e.target === popup) this._closeSponsorPopup(popup);
            });

            document.getElementById('visitAuthorBtn').addEventListener('click', () => {
                const url = 'https://link3.cc/liu13';
                if (typeof webapp !== 'undefined') webapp.browse(url);
                else window.open(url, '_blank');
                this._closeSponsorPopup(popup);
            });

            document.getElementById('alipayQr').addEventListener('click', () => this.handleImageClick(2, CONFIG.ASSETS.ALIPAY));
            document.getElementById('wechatQr').addEventListener('click', () => this.handleImageClick(1, CONFIG.ASSETS.WECHAT));

            requestAnimationFrame(() => {
                popup.style.display = 'flex';
                requestAnimationFrame(() => {
                    popup.style.opacity = '1';
                });
            });
        }

        _closeSponsorPopup(popup) {
            popup.style.opacity = '0';
            setTimeout(() => {
                if (popup.parentNode) popup.parentNode.removeChild(popup);
            }, 300);
        }

        async handleImageClick(elementType, imageUrl) {
            if (typeof webapp !== 'undefined') webapp.toast('正在保存赞赏码...');
            try {
                const response = await fetch(imageUrl);
                const blob = await response.blob();
                const blobUrl = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = `donate_${Date.now()}.png`;
                document.body.appendChild(link);
                link.click();
                setTimeout(() => {
                    document.body.removeChild(link);
                    URL.revokeObjectURL(blobUrl);
                    if (typeof webapp !== 'undefined') {
                        if (imageUrl.includes('wechat')) webapp.start('com.tencent.mm');
                        else if (imageUrl.includes('alipay')) webapp.start('com.eg.android.AlipayGphone');
                    }
                }, 100);
            } catch (e) {
                if (typeof webapp !== 'undefined') webapp.toast('保存失败');
            }
        }
    }

    const appSystem = new SystemApp();
    window.DxxSystem = {
        checkUpdate: () => appSystem.checkUpdate(),
        openSponsor: () => appSystem.openSponsor(),
        getVersion: () => appSystem.state.currentVersion,
        getHitokoto: () => appSystem.state.hitokoto,
        verify: () => appSystem._verifyIntegrity()
    };

})(window, document);