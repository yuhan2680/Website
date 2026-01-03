document.addEventListener("DOMContentLoaded", () => {
	const container = document.querySelector(".friend-container");

	const linkList = friendLinks.map(item => `
	  <a class="friend-card" href="${item.link}" target="_blank">
      <img src="${item.avatar}" alt="Twisuki">
      <div class="friend-content">
        <div class="friend-title">${item.name}</div>
        <div class="friend-desc">${item.desc}</div>
      </div>
    </a>
  `);

	container.innerHTML = "";
	container.innerHTML = linkList.join("");
})
