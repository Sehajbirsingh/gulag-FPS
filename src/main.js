import { Game } from "./game/Game.js";
import "./style.css";

const root = document.querySelector("#app");
const game = new Game(root);
game.start();
