# GDG ChatBot Frontend Devlog (2026-04-29 Update)

## 版本區間
- 前一版基準：2026-04-28（C1~C3 併入）
- 目前版本：2026-04-29（C4~C7 與 C7 視覺微調）

## 本次重點更動總覽
1. 聊天室 API 呼叫集中化（C1）
2. 聊天室改名流程完成（C2）
3. 聊天室刪除流程與保底行為完成（C3）
4. 卡片操作改為精簡操作選單（C4）
5. 側邊欄收合切換完成（C5）
6. 側邊欄控制按鈕風格統一為 icon-only（C6）
7. 右鍵/三點選單視覺與定位修正（C7）
8. C7 後續微調：選單項目背景透明度再下修，提升通透感（本次）

## 詳細變更

### C1: Frontend Conversation API Adapter
- 新增 adapter 層，統一管理聊天室 `load/create/rename/delete` 呼叫。
- `page.js` 將聊天室列表與新增流程改為透過 adapter 執行。
- 對未實作端點（404/405/501）轉為可辨識錯誤，前端可顯示友善提示。

### C2: Rename UI Flow
- 聊天室卡片加入改名互動流程（編輯、儲存、取消）。
- 與既有對話切換流程整合，避免狀態互相覆蓋。

### C3: Delete Conversation Flow
- 加入刪除二次確認。
- 刪除 active 聊天室時，自動切到其他可用聊天室。
- 若刪至最後一個聊天室，保底建立 `New Chat`。
- 對未實作 API 維持友善提示，避免 UI 無回應。

### C4: Conversation Action Menu Compact
- 將原本占空間的按鈕改為 `⋮` 操作選單。
- 支援右鍵開啟同一份選單。
- 支援外點關閉與 `Escape` 關閉。
- 改名/刪除流程沿用 C2/C3 邏輯。

### C5: Sidebar Collapse Toggle
- 新增側邊欄收合/展開狀態控制。
- 收合後聊天主區仍保持可用，避免主要流程中斷。

### C6: Sidebar Control Unified Icon Style
- 收合與展開狀態下的控制按鈕位置、尺寸與風格統一。
- 改為 icon-only 呈現，視覺一致性提升。

### C7: Conversation Menu Visual Fix
- 修正右鍵選單定位，避免選單錯位拉寬。
- 下修選單尺寸為更緊湊版本。
- 設定半透明背景與模糊效果。
- 弱化 `⋮` 外框但保留 hover/focus 可見回饋。

### C7 Follow-up（本次）
- 選單外層維持約 50% 透明（`rgba(255,255,255,0.5)`）。
- 再下修選單項目底色透明度，降低「白底塊」感：
  - default：`0.62 -> 0.36`
  - hover：`0.92 -> 0.52`
  - danger hover：改為半透明紅底 `rgba(255, 240, 243, 0.56)`

## 驗證狀態
- `frontend` build：`npm run build` 通過（僅 lockfile root 警告，非阻斷）。
- C1/C3/C4/C5/C6：已完成驗收並通過。
- C7：已補 task-specific commit 與 `git show --name-only` 可追溯證據，可重送驗收。

## 影響檔案（本次補充）
- `frontend/src/app/page.module.css`
- `GDG_CHATBOT_FRONTEND_DEVLOG_2026-04-29_UPDATE.md`
