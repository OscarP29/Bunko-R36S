import { test } from "node:test";
import assert from "node:assert/strict";
import { autoSaga, flattenOrder, organizeGames, parseSagaStore, sagaOf } from "./sagas.ts";

const game = (title: string, fileName = `${title}.gba`) => ({ title, fileName });

test("autoSaga reconoce sagas conocidas y prefijos con dos puntos o guion", () => {
  assert.equal(autoSaga("Pokémon Esmeralda"), "Pokémon");
  assert.equal(autoSaga("The Legend of Zelda - The Minish Cap (Europe)"), "The Legend of Zelda");
  assert.equal(autoSaga("Mario Kart Super Circuit"), "Mario Kart");
  assert.equal(autoSaga("Super Mario Advance 4"), "Mario");
  assert.equal(autoSaga("Rockman Zero"), "Mega Man");
  assert.equal(autoSaga("Sigma Star Saga: Prólogo"), "Sigma Star Saga");
  assert.equal(autoSaga("Tetrimino Deluxe"), null);
});

test("sagaOf prioriza la elección manual, también la de «sin saga»", () => {
  assert.equal(sagaOf(game("Pokémon Rojo Fuego"), {}), "Pokémon");
  assert.equal(sagaOf(game("Juego"), { "Juego.gba": "Mi saga" }), "Mi saga");
  assert.equal(sagaOf(game("Pokémon Pinball"), { "Pokémon Pinball.gba": "" }), null);
});

test("organizeGames en modo alfabético ordena por título con números naturales", () => {
  const order = flattenOrder(
    organizeGames([game("Juego 10"), game("Ábaco"), game("Juego 2")], "alpha"),
  );
  assert.deepEqual(order, ["Ábaco.gba", "Juego 2.gba", "Juego 10.gba"]);
});

test("organizeGames agrupa sagas de dos o más juegos e intercala los sueltos", () => {
  const groups = organizeGames(
    [
      game("Pokémon Zafiro"),
      game("Advance Wars"),
      game("Pokémon Esmeralda"),
      game("Sonic Advance"),
      game("Rayman"),
    ],
    "saga",
  );
  assert.deepEqual(
    groups.map((group) => group.saga ?? group.games[0].title),
    ["Advance Wars", "Pokémon", "Rayman", "Sonic Advance"],
  );
  assert.deepEqual(
    groups[1].games.map((item) => item.title),
    ["Pokémon Esmeralda", "Pokémon Zafiro"],
  );
  // Un juego solo de su saga no forma grupo...
  assert.equal(groups[3].saga, null);
});

test("organizeGames respeta una saga manual aunque tenga un solo juego", () => {
  const groups = organizeGames([game("Rayman"), game("Zoo")], "saga", { "Rayman.gba": "Ubisoft" });
  assert.deepEqual(groups.map((group) => group.saga), ["Ubisoft", null]);
});

test("parseSagaStore descarta contenido inválido", () => {
  assert.deepEqual(parseSagaStore(""), {});
  assert.deepEqual(parseSagaStore("[1]"), {});
  assert.deepEqual(parseSagaStore('{"gba":{"a.gba":"Pokémon","b.gba":3},"x":5}'), {
    gba: { "a.gba": "Pokémon" },
  });
});
