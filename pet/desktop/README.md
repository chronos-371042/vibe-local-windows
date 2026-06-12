# vibe-pet desktop 🖥️🐣

Claude Code の状態を可視化する**デスクトップペット**(Codex Pets の自作版)です。
透過・フレームレス・常に最前面の小窓にドット絵のペットが常駐し、Claude Code が働いているか、入力を待っているか、終わったかがひと目で分かります。

```
Claude Code hooks ──(state-hook.js)──▶ ~/.claude/pet/state.json ◀──(監視)── pet.py
```

**疎結合**: hooks はファイルを書くだけ、ペットはファイルを読むだけ。ペットを起動していなくても Claude Code 側は一切影響を受けません(state-hook.js は必ず exit 0)。

## 状態

| 状態 | トリガー(公式hooksイベント) | アニメーション |
| --- | --- | --- |
| `idle` | `SessionStart` / `SessionEnd` / `Notification (idle_prompt)` | まばたき・ゆっくり上下 |
| `working` | `PreToolUse` / `UserPromptSubmit` | 汗を垂らして作業 |
| `waiting_input` | `Notification (permission_prompt / elicitation_dialog)` | **左右に揺れて「?」が黄白に点滅**(高速) |
| `done` | `Stop` | **ジャンプ+「!」+キラキラ**(8秒後に idle へ) |
| `error` | `PostToolUseFailure` / `StopFailure` | **震えて赤い「x」が点滅**(20秒後に idle へ) |

hooks が15分更新されない場合は idle に戻ります(セッションが落ちた場合の保険)。

## 必要なもの

- Node.js(Claude Code が動いていれば有り)
- Python 3 + tkinter
  - Windows / macOS: [python.org](https://www.python.org/) のインストーラに同梱
  - Debian/Ubuntu: `sudo apt install python3-tk`

Electron(~200MB)や Tauri(Rustビルド必須)は本リポジトリの「軽量・依存最小」方針に合わないため、**標準ライブラリのみの tkinter** を採用しています。

## セットアップ

```sh
# 1. hooks を ~/.claude/settings.json にマージ(既存hooksは保持・バックアップ自動作成)
node pet/desktop/install-hooks.js

# 2. ペットを起動
python pet/desktop/pet.py        # Windowsでコンソールを出したくない場合: pythonw pet\desktop\pet.py
```

Claude Code を再起動(または新セッション開始)すると hooks が有効になります。

## 操作

- **ドラッグ**: 移動(位置は `~/.claude/pet/ui.json` に記憶)
- **右クリック**(macは Ctrl+クリック): 「隠す(30分)」/「終了」

## スプライトの差し替え

キャラはコード描画のピクセルアート(12×10グリッド)ですが、`~/.claude/pet/sprites/` に
`<状態>_<番号>.png`(例: `working_0.png`, `working_1.png`, …番号は0から連番)を置くと、その状態の描画が PNG に差し替わります。透過PNG対応。推奨サイズはウィンドウと同じ 84×70px(任意)。

## アンインストール

```sh
# hooks を削除(vibe-petのエントリのみ。他のhooksには触れません)
node pet/desktop/install-hooks.js --uninstall

# ペットの状態ファイルを削除
# Windows:  rmdir /s %USERPROFILE%\.claude\pet
# mac/Linux: rm -rf ~/.claude/pet
```

`~/.claude/settings.json.pet-backup-*` というバックアップが残っていれば手で削除して構いません。

## 制限・注意

- **対象OS**: Windows で完全動作(色キー透過)。macOS はベストエフォートの透過、Linux/X11 は色キー透過がないため暗色の小窓表示になります
- **複数セッション**: 同時に複数の Claude Code セッションを動かすと最後に書いたものが勝ちます(state.json は1つ)
- `waiting_input` 解除のイベントは無いため、許可後に次のツールが動いた時点(`PreToolUse`)で `working` に切り替わります
