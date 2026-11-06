// help-chatgpt-prompts.html の「コピー」ボタン (TASK-20261106-002)。押した文をそのままクリップボードへ。
// クリップボードが使えない (古いブラウザ・http) 時は文を選択状態にして、長押し/⌘C で写せるようにする。
for (const button of document.querySelectorAll("button.copy[data-copy]")) {
  button.addEventListener("click", async () => {
    const pre = document.getElementById(button.dataset.copy);
    if (!pre) return;
    const text = pre.textContent;
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      const range = document.createRange();
      range.selectNodeContents(pre);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    button.textContent = ok ? "コピーしました" : "選択しました。長押しでコピー";
    button.classList.toggle("done", ok);
    setTimeout(() => { button.textContent = "コピー"; button.classList.remove("done"); }, 1600);
  });
}
