(() => {
  "use strict";

  const MAX_IMAGES = 9;
  const PAGE_W = 210;
  const PAGE_H = 297;
  const CARD_W = 53;
  const CARD_H = 84;
  const GAP = 5;
  const LEFT = 10;
  const TOP = 10;
  const state = { front: [], back: [] };

  const ui = {
    front: {
      input: document.querySelector("#front-input"),
      drop: document.querySelector("#front-drop"),
      preview: document.querySelector("#front-preview"),
      count: document.querySelector("#front-count"),
    },
    back: {
      input: document.querySelector("#back-input"),
      drop: document.querySelector("#back-drop"),
      preview: document.querySelector("#back-preview"),
      count: document.querySelector("#back-count"),
    },
    generate: document.querySelector("#generate"),
    status: document.querySelector("#status"),
  };

  function setStatus(message, type = "") {
    ui.status.textContent = message;
    ui.status.className = `status ${type}`.trim();
  }

  function updateState() {
    ["front", "back"].forEach((side) => {
      ui[side].count.textContent = `${state[side].length} / ${MAX_IMAGES}`;
      ui[side].preview.replaceChildren();
      state[side].forEach((item, index) => {
        const wrapper = document.createElement("div");
        wrapper.className = "preview-item";
        const image = document.createElement("img");
        image.src = item.url;
        image.alt = `${side === "front" ? "Frente" : "Verso"} ${index + 1}`;
        const number = document.createElement("span");
        number.className = "preview-index";
        number.textContent = String(index + 1);
        const remove = document.createElement("button");
        remove.className = "remove-image";
        remove.type = "button";
        remove.setAttribute("aria-label", `Remover imagem ${index + 1}`);
        remove.textContent = "×";
        remove.addEventListener("click", () => removeImage(side, index));
        wrapper.append(image, number, remove);
        ui[side].preview.append(wrapper);
      });
    });

    const frontCount = state.front.length;
    const backCount = state.back.length;
    const ready = frontCount > 0 && frontCount === backCount;
    ui.generate.disabled = !ready;
    if (!frontCount && !backCount) setStatus("Adicione a mesma quantidade de fotos na frente e no verso.");
    else if (frontCount !== backCount) setStatus(`A frente tem ${frontCount} e o verso tem ${backCount}. As quantidades precisam ser iguais.`, "error");
    else setStatus(`${frontCount} ${frontCount === 1 ? "photocard pronto" : "photocards prontos"} para montar.`, "success");
  }

  function removeImage(side, index) {
    URL.revokeObjectURL(state[side][index].url);
    state[side].splice(index, 1);
    updateState();
  }

  function addFiles(side, fileList) {
    const imageFiles = [...fileList].filter((file) => file.type.startsWith("image/"));
    const available = MAX_IMAGES - state[side].length;
    if (!available) {
      setStatus("O limite é de 9 imagens por lado.", "error");
      return;
    }
    imageFiles.slice(0, available).forEach((file) => state[side].push({ file, url: URL.createObjectURL(file) }));
    if (imageFiles.length > available) setStatus(`Somente as primeiras ${available} imagens foram adicionadas.`, "error");
    updateState();
  }

  ["front", "back"].forEach((side) => {
    ui[side].input.addEventListener("change", (event) => {
      addFiles(side, event.target.files);
      event.target.value = "";
    });
    ["dragenter", "dragover"].forEach((name) => ui[side].drop.addEventListener(name, (event) => {
      event.preventDefault();
      ui[side].drop.classList.add("dragging");
    }));
    ["dragleave", "drop"].forEach((name) => ui[side].drop.addEventListener(name, (event) => {
      event.preventDefault();
      ui[side].drop.classList.remove("dragging");
    }));
    ui[side].drop.addEventListener("drop", (event) => addFiles(side, event.dataTransfer.files));
  });

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Não foi possível abrir ${file.name}`)); };
      image.src = url;
    });
  }

  async function makeCard(file) {
    const image = await loadImage(file);
    const canvas = document.createElement("canvas");
    canvas.width = 1060;
    canvas.height = 1680;
    const ctx = canvas.getContext("2d");
    const radius = 64;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, radius);
    ctx.clip();

    const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    ctx.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    return canvas.toDataURL("image/jpeg", 0.94);
  }

  function cardPosition(index, isBack) {
    const row = Math.floor(index / 3);
    const col = index % 3;
    const frontX = LEFT + col * (CARD_W + GAP);
    return {
      x: isBack ? PAGE_W - frontX - CARD_W : frontX,
      y: TOP + row * (CARD_H + GAP),
    };
  }

  async function createPdf() {
    if (!window.jspdf) {
      setStatus("Não foi possível carregar o gerador de PDF. Verifique sua internet e tente novamente.", "error");
      return;
    }
    ui.generate.disabled = true;
    ui.generate.querySelector("span").textContent = "Montando o PDF...";
    setStatus("Preparando as imagens. Isso pode levar alguns segundos.");

    try {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
      pdf.setProperties({ title: "Photocards - frente e verso", creator: "Photocard Print" });
      const fronts = await Promise.all(state.front.map((item) => makeCard(item.file)));
      const backs = await Promise.all(state.back.map((item) => makeCard(item.file)));

      fronts.forEach((data, index) => {
        const { x, y } = cardPosition(index, false);
        pdf.addImage(data, "JPEG", x, y, CARD_W, CARD_H, undefined, "FAST");
      });
      pdf.addPage("a4", "portrait");
      backs.forEach((data, index) => {
        const { x, y } = cardPosition(index, true);
        pdf.addImage(data, "JPEG", x, y, CARD_W, CARD_H, undefined, "FAST");
      });

      pdf.save("photocards_frente_verso.pdf");
      setStatus("PDF criado e baixado com sucesso.", "success");
    } catch (error) {
      console.error(error);
      setStatus("Não foi possível criar o PDF. Tente usar imagens JPG ou PNG menores.", "error");
    } finally {
      ui.generate.disabled = false;
      ui.generate.querySelector("span").textContent = "Criar PDF para impressão";
    }
  }

  ui.generate.addEventListener("click", createPdf);
  updateState();
})();
