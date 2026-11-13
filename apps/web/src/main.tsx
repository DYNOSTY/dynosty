import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./style.css";

const root = document.getElementById("root");
if (!root) throw new Error("화면을 표시할 root 요소가 없습니다.");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
