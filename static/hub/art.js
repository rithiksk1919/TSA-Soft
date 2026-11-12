// Flat illustrations for the school. Decorative only (aria-hidden); every clickable thing is an HTML button or link.

function svg(viewBox, inner, cls) {
  let classAttr = "";
  if (cls) {
    classAttr = ' class="' + cls + '"';
  }
  return '<svg' + classAttr + ' viewBox="' + viewBox + '" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">' + inner + "</svg>";
}

function floorBoards(y, width, height, color) {
  let out = '<rect x="0" y="' + y + '" width="' + width + '" height="' + height + '" fill="' + color + '"/>';
  for (let x = 0; x < width; x = x + 90) {
    out += '<path d="M' + x + " " + y + "v" + height + '" stroke="#A9805A" stroke-width="2"/>';
  }
  return out;
}

function books(x, y, count, height) {
  const colors = ["#7B3F36", "#2D4A6E", "#B8964A", "#4F6B45", "#8A6446", "#3E5871", "#A1523E"];
  let out = "";
  for (let i = 0; i < count; i = i + 1) {
    const h = height - (i % 3) * 6;
    out += '<rect x="' + (x + i * 15) + '" y="' + (y + height - h) + '" width="12" height="' + h + '" fill="' + colors[i % colors.length] + '"/>';
  }
  return out;
}

// ---- hub rooms (600 x 260) ----
export function classroomRoom() {
  let s = '<rect width="600" height="260" fill="#F1E6CF"/>';
  s += floorBoards(205, 600, 55, "#B98D63");
  s += '<rect x="276" y="40" width="250" height="122" rx="4" fill="#6B4C34"/><rect x="286" y="50" width="230" height="102" fill="#2F4A3E"/>';
  s += '<g font-family="IBM Plex Mono, monospace" font-size="13" fill="#ECE7D8"><text x="300" y="78">def scope_demo():</text><text x="316" y="100">x = 1</text><text x="316" y="122">return x + y</text></g>';
  s += '<rect x="540" y="46" width="44" height="86" fill="#6B4C34"/><rect x="546" y="52" width="32" height="74" fill="#A9C7D6"/><path d="M562 52v74M546 89h32" stroke="#6B4C34" stroke-width="3"/>';
  s += '<g fill="#6B4C34"><rect x="240" y="192" width="90" height="10"/><rect x="248" y="202" width="6" height="30"/><rect x="316" y="202" width="6" height="30"/>';
  s += '<rect x="380" y="192" width="90" height="10"/><rect x="388" y="202" width="6" height="30"/><rect x="456" y="202" width="6" height="30"/></g>';
  return svg("0 0 600 260", s);
}

export function libraryRoom() {
  let s = '<rect width="600" height="260" fill="#F1E6CF"/>';
  s += floorBoards(205, 600, 55, "#B98D63");
  s += '<rect x="200" y="54" width="92" height="84" fill="#6B4C34"/><rect x="207" y="61" width="78" height="70" fill="#CFE0E6"/><path d="M207 131l26-34 18 20 14-12 20 26z" fill="#8DAA7A"/>';
  s += '<rect x="380" y="30" width="190" height="175" fill="#6B4C34"/>';
  s += '<rect x="388" y="38" width="174" height="44" fill="#4A3526"/>' + books(392, 42, 11, 38);
  s += '<rect x="388" y="88" width="174" height="44" fill="#4A3526"/>' + books(392, 92, 11, 38);
  s += '<rect x="388" y="138" width="174" height="44" fill="#4A3526"/>' + books(392, 142, 11, 38);
  s += '<g fill="#6B4C34"><rect x="220" y="168" width="130" height="10"/><rect x="230" y="178" width="8" height="40"/><rect x="332" y="178" width="8" height="40"/></g>';
  s += '<rect x="240" y="152" width="40" height="16" fill="#FBF8F1" stroke="#B8964A"/><path d="M300 168v-36h12" stroke="#B8964A" stroke-width="3" fill="none"/><path d="M302 132h26l-6-10h-14z" fill="#B8964A"/>';
  return svg("0 0 600 260", s);
}

export function gymRoom() {
  let s = '<rect width="600" height="260" fill="#F1E6CF"/>';
  s += '<rect y="170" width="600" height="90" fill="#C9A27A"/><path d="M0 170h600" stroke="#A9805A" stroke-width="3"/>';
  s += '<ellipse cx="300" cy="220" rx="110" ry="26" fill="none" stroke="#FBF8F1" stroke-width="3"/><path d="M300 170v90" stroke="#FBF8F1" stroke-width="3"/>';
  s += '<g><path d="M250 40l18 26 18-26z" fill="#4F6B45"/><path d="M296 40l18 26 18-26z" fill="#B8964A"/><path d="M342 40l18 26 18-26z" fill="#9B3A28"/></g>';
  s += '<rect x="420" y="50" width="88" height="64" fill="#FBF8F1" stroke="#6B4C34" stroke-width="5"/><rect x="448" y="72" width="32" height="24" fill="none" stroke="#C0562F" stroke-width="3"/>';
  s += '<ellipse cx="464" cy="118" rx="22" ry="5" fill="none" stroke="#C0562F" stroke-width="4"/><path d="M446 120l6 26M482 120l-6 26M464 122v24" stroke="#FBF8F1" stroke-width="2"/>';
  s += '<circle cx="396" cy="226" r="16" fill="#C0562F"/><path d="M380 226h32M396 210v32" stroke="#6B2A16" stroke-width="2"/>';
  return svg("0 0 600 260", s);
}

export function lunchRoom() {
  let s = '<rect width="600" height="260" fill="#F1E6CF"/>';
  s += floorBoards(205, 600, 55, "#B98D63");
  s += '<circle cx="470" cy="62" r="30" fill="#FBF8F1" stroke="#3A2A1F" stroke-width="5"/><path d="M470 62V44M470 62l12 8" stroke="#3A2A1F" stroke-width="4" stroke-linecap="round"/>';
  s += '<rect x="250" y="120" width="160" height="60" fill="#8A6446"/><rect x="250" y="112" width="160" height="10" fill="#6B4C34"/>';
  s += '<rect x="266" y="96" width="34" height="18" fill="#A9C7D6"/><rect x="314" y="96" width="34" height="18" fill="#E8C77A"/>';
  s += '<g fill="#6B4C34"><rect x="330" y="196" width="160" height="8"/><rect x="340" y="204" width="6" height="30"/><rect x="474" y="204" width="6" height="30"/></g>';
  s += '<rect x="360" y="188" width="70" height="8" fill="#FBF8F1"/>';
  return svg("0 0 600 260", s);
}

// ---- full scenes (1440 x 860) ----
export function classroomScene() {
  let s = '<rect width="1440" height="860" fill="#F1E6CF"/>';
  s += '<rect y="560" width="1440" height="40" fill="#8A6446"/>';
  s += floorBoards(600, 1440, 260, "#B98D63");
  // chalkboard
  s += '<rect x="430" y="120" width="560" height="300" rx="6" fill="#6B4C34"/><rect x="446" y="136" width="528" height="268" fill="#2F4A3E"/>';
  s += '<path d="M480 200h220M480 240h300M480 280h180M480 320h260" stroke="#ECE7D8" stroke-width="5" stroke-linecap="round" opacity=".55"/>';
  s += '<rect x="446" y="404" width="528" height="12" fill="#B8964A"/>';
  // window
  s += '<rect x="270" y="150" width="130" height="250" fill="#6B4C34"/><rect x="282" y="162" width="106" height="226" fill="#A9C7D6"/>';
  s += '<path d="M282 388l36-70 26 36 18-20 26 54z" fill="#8DAA7A"/><path d="M335 162v226M282 275h106" stroke="#6B4C34" stroke-width="7"/>';
  // clock
  s += '<circle cx="1180" cy="170" r="54" fill="#FBF8F1" stroke="#3A2A1F" stroke-width="8"/><path d="M1180 170v-34M1180 170l24 14" stroke="#3A2A1F" stroke-width="6" stroke-linecap="round"/>';
  // teacher desk with textbook
  s += '<rect x="1040" y="500" width="300" height="24" fill="#6B4C34"/><rect x="1056" y="524" width="268" height="150" fill="#8A6446"/>';
  s += '<path d="M1110 500l50-14 50 14z" fill="#FBF8F1" stroke="#B8964A" stroke-width="3"/>';
  // listening desk with headphones
  s += '<rect x="120" y="560" width="250" height="20" fill="#6B4C34"/><rect x="136" y="580" width="12" height="120" fill="#6B4C34"/><rect x="342" y="580" width="12" height="120" fill="#6B4C34"/>';
  s += '<path d="M210 556a35 35 0 0 1 70 0" stroke="#3A2A1F" stroke-width="7" fill="none"/><rect x="200" y="540" width="18" height="22" rx="5" fill="#3A2A1F"/><rect x="272" y="540" width="18" height="22" rx="5" fill="#3A2A1F"/>';
  // student desks
  for (let i = 0; i < 3; i = i + 1) {
    const x = 470 + i * 180;
    s += '<rect x="' + x + '" y="640" width="140" height="16" fill="#6B4C34"/><rect x="' + (x + 10) + '" y="656" width="10" height="90" fill="#6B4C34"/><rect x="' + (x + 120) + '" y="656" width="10" height="90" fill="#6B4C34"/>';
  }
  return svg("0 0 1440 860", s, "art");
}

export function gymScene() {
  let s = '<rect width="1440" height="860" fill="#EADFC6"/>';
  s += '<rect y="0" width="1440" height="80" fill="#D9C7A2"/>';
  s += '<rect y="520" width="1440" height="340" fill="#C9A27A"/><rect y="510" width="1440" height="14" fill="#8A6446"/>';
  for (let x = 0; x < 1440; x = x + 120) {
    s += '<path d="M' + x + ' 524v336" stroke="#B89068" stroke-width="2"/>';
  }
  s += '<path d="M780 524v336" stroke="#FBF8F1" stroke-width="6"/><ellipse cx="780" cy="720" rx="230" ry="70" fill="none" stroke="#FBF8F1" stroke-width="6"/>';
  const flags = ["#4F6B45", "#B8964A", "#9B3A28"];
  for (let i = 0; i < 3; i = i + 1) {
    const x = 860 + i * 84;
    s += '<path d="M' + x + ' 96l30 52 30-52z" fill="' + flags[i] + '"/>';
  }
  // hoop: backboard, rim, net, pole
  s += '<rect x="1290" y="180" width="22" height="430" fill="#6B4C34"/>';
  s += '<rect x="1180" y="160" width="130" height="110" fill="#FBF8F1" stroke="#6B4C34" stroke-width="8"/><rect x="1222" y="196" width="46" height="40" fill="none" stroke="#C0562F" stroke-width="5"/>';
  s += '<ellipse cx="1210" cy="280" rx="46" ry="10" fill="none" stroke="#C0562F" stroke-width="7"/>';
  s += '<path d="M1168 284l12 62M1252 284l-12 62M1196 288l4 60M1224 288l-4 60" stroke="#FBF8F1" stroke-width="3"/>';
  return svg("0 0 1440 860", s, "art");
}

export function lunchScene() {
  let s = '<rect width="1440" height="860" fill="#C9A57A"/>';
  s += '<rect x="1030" y="440" width="300" height="18" fill="#6B4C34"/><rect x="1050" y="458" width="14" height="140" fill="#6B4C34"/><rect x="1296" y="458" width="14" height="140" fill="#6B4C34"/>';
  s += '<rect x="1080" y="412" width="100" height="28" rx="4" fill="#FBF8F1" stroke="#6B4C34" stroke-width="3"/><circle cx="1110" cy="400" r="18" fill="#A1523E"/>';
  s += '<rect x="1130" y="384" width="34" height="30" rx="4" fill="#A9C7D6" stroke="#6B4C34" stroke-width="3"/>';
  s += '<rect x="1200" y="404" width="60" height="36" rx="5" fill="#E8C77A" stroke="#6B4C34" stroke-width="3"/>';
  return svg("0 0 1440 860", s, "art");
}

export function ballSvg() {
  return '<svg viewBox="0 0 46 46" aria-hidden="true" focusable="false"><circle cx="23" cy="23" r="21" fill="#C0562F" stroke="#6B2A16" stroke-width="2"/>' +
    '<path d="M2 23h42M23 2v42M8 8c8 8 8 22 0 30M38 8c-8 8-8 22 0 30" stroke="#6B2A16" stroke-width="2" fill="none"/></svg>';
}
