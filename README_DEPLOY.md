# Yir的工作台 GitHub Pages 部署

已生成的站点文件：

- `index.html`
- `data/news.json`
- `data/market.json`
- `scripts/update-data.mjs`
- `.github/workflows/update-data.yml`

推荐部署方式：

1. 在 GitHub 新建公开仓库，例如 `yir-workbench`。
2. 上传本目录里的全部内容到仓库根目录，包括隐藏的 `.github` 文件夹。
3. 进入仓库 `Settings > Pages`。
4. Source 选择 `Deploy from a branch`，Branch 选择 `main` 和 `/root`。
5. 保存后等待 Pages 构建完成。

命令行部署方式（需先完成 GitHub 授权）：

```powershell
cd "C:\Users\24426\Documents\Codex\2026-08-02\work-buddy-yir-html-pwa-service\outputs"
git init
git add .
git commit -m "Deploy Yir workbench PWA"
git branch -M main
git remote add origin https://github.com/wlpwyr/yir-workbench.git
git push -u origin main
```

部署完成后的默认访问地址通常为：

```text
https://wlpwyr.github.io/yir-workbench/
```

注意：GitHub 不支持用网页登录密码进行 Git 推送。请使用 GitHub CLI 登录、浏览器授权、SSH key，或 Personal Access Token。

同源数据方案：

- GitHub Actions 会定时运行 `scripts/update-data.mjs`。
- 新闻写入 `data/news.json`。
- 智能看盘写入 `data/market.json`。
- 前端优先读取同源 JSON，避免浏览器 CORS 和第三方接口超时。
- 初次上传后可在 GitHub 仓库 `Actions > Update Yir Workbench Data > Run workflow` 手动运行一次。
- 如果智能看盘仍显示旧提示“正在尝试联网获取”，说明手机/PWA 还在使用旧缓存；请关闭已安装 PWA 后重新打开，或在浏览器清除该站点数据再进入。
- 如果提示缺少同源看盘库，请确认仓库根目录包含 `data/market.json`，并确认 Actions 已成功运行。

账号数据库：

- 账号数据库全量保存在浏览器 `localStorage` 的 `yir_accounts` 键中，不同账号的数据和进度隔离。
- 新账号默认待审批，管理员账号可在“我的 > 管理员审批”里同意、拒绝，或粘贴邮件里的请求码生成审批码。
- 当前账号 JSON、同步码和管理员整库备份会包含本地登录信息，只建议在自己的设备之间迁移。
- GitHub Pages 是静态网站，不能真正代替后端数据库或服务器邮件审批；这里使用本地账号库 + `mailto:` 邮件确认 + 同步码迁移实现。
