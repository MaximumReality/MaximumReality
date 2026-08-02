
document.addEventListener("DOMContentLoaded", () => {
  const counter = document.querySelector("[data-counter]");
  if (counter) {
    const base = 1337742;
    const drift = Math.floor((Date.now() / 1000) % 333);
    counter.textContent = (base + drift).toLocaleString();
  }

  document.querySelectorAll("[data-fake-action]").forEach(el => {
    el.addEventListener("click", e => {
      e.preventDefault();
      const old = el.textContent;
      el.textContent = "✓ Signal sent";
      setTimeout(() => el.textContent = old, 1400);
    });
  });

  const goggleForm = document.querySelector("#goggle-form");
  if (goggleForm) {
    goggleForm.addEventListener("submit", e => {
      e.preventDefault();
      const q = document.querySelector("#goggle-q").value.trim() || "maximum reality";
      document.querySelector("#goggle-results").innerHTML = `
        <div class="result"><h3><a href="../wikiweirdia/">WikiWeirdia: ${escapeHtml(q)}</a></h3><p>Facts, rumors, and at least one suspicious footnote.</p></div>
        <div class="result"><h3><a href="../geoglitches/">GeoGlitches Fan Shrine</a></h3><p>Best viewed at 800×600 with three broken plugins.</p></div>
        <div class="result"><h3><a href="../blockbuster-exe/">Blockbuster.exe memory rental</a></h3><p>${escapeHtml(q)} may already be overdue in another timeline.</p></div>
      `;
    });
  }
});

function escapeHtml(value){
  return value.replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"
  })[ch]);
}
