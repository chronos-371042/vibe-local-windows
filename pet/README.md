# vibe-pet 🐣

Codex のペットみたいに、**コーディングすると育つターミナルペット**です。
Claude Code が動作する環境なら Node.js が入っているので、追加インストールは不要・依存ゼロの単一ファイルで動きます(Windows Terminal / PowerShell / cmd / Git Bash / WSL 対応)。

A tiny terminal pet that grows while you code, inspired by the Codex pet.
Zero dependencies — it runs anywhere Node.js (already required by Claude Code) runs.

Codexのペットと同じ、テラコッタ色のドット絵クリーチャーです。カラー対応ターミナル(Windows Terminal / PowerShell / VS Code など)では半ブロック文字 + 24bitカラーでドット絵として描画されます:

```
     #      #
    ##########
   ##o######o##
   ############
     #  ##  #

   Vibe  (Adult, Lv.11)
   mood: content   age: 12d
   food [########--] 84%
   xp   523  (fully grown)
```

(上はASCIIフォールバック表示。パイプ時や `NO_COLOR=1` / `VIBE_PET_ASCII=1` でもこの表示になります)

## 使い方 / Usage

リポジトリのルートで:

```sh
node pet/pet.js              # ライブ表示(f = 餌やり, p = 遊ぶ, q = 終了)
node pet/pet.js status       # ステータスカードを1回表示
node pet/pet.js feed         # 餌をあげる (+2 xp)
node pet/pet.js play         # 遊ぶ (+3 xp)
node pet/pet.js name Mochi   # 名前をつける
node pet/pet.js reset        # 新しい卵からやり直す
```

ペットの状態は `~/.vibe-pet.json` に保存されます。

## 成長 / Growth

XP が貯まると卵から孵って成長します:

| ステージ | 必要 XP |
| -------- | ------- |
| 🥚 Egg   | 0       |
| Baby     | 30      |
| Kid      | 150     |
| Adult    | 500     |

お腹(food)は時間とともに減っていきます。空腹だと悲しい顔に、夜はうとうとします。

## Claude Code 連携 / Claude Code integration

Codex のペットのように、**Claude Code が作業するたびにペットが XP を獲得**し、ステータスラインに常駐させられます。

`pet/claude-settings.example.json` の内容をプロジェクトの `.claude/settings.json`(またはユーザー設定 `~/.claude/settings.json`)にマージしてください:

- **statusLine** — ステータスラインに**ドット絵のミニアイコン**(1行サイズのペット)が常駐し、**いまClaude Codeがしている作業**が小さくテキスト表示されます:

  ```
  ▄█▄ Vibe Lv.7 [###--] | Edit: pet.js
  ```

  作業内容は hooks が受け取るイベントから自動で要約されます(例: `Edit: pet.js`、`Bash: Run the full test suite`、完了時は `task done!`)。作業していないときはペットの気分が表示されます。
- **PostToolUse hook** — Claude Code がツールを使うたびに +1 xp(同時に作業内容を記録)
- **Stop hook** — タスク完了ごとに +5 xp

つまり、Claude Code に仕事をさせるほどペットが育ちます。`node pet/pet.js` のライブ表示を別ペインで常駐させておくと、大きいペットの横に `now: ...` として同じ作業内容が表示されます(hooks の更新を自動で拾います)。

> ユーザー設定に入れる場合は、コマンドをフルパスにしてください
> (例: `node C:/path/to/vibe-local-windows/pet/pet.js statusline`)。
