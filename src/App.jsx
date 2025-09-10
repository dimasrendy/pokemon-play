import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search } from "lucide-react";

const API_BASE = "https://pokeapi.co/api/v2";

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function computePowerScore(stats = []) {
  const weight = {
    hp: 0.9,
    attack: 1.2,
    defense: 0.9,
    "special-attack": 1.0,
    "special-defense": 0.9,
    speed: 1.1,
  };
  let score = 0;
  for (const s of stats) {
    const key = s.stat.name;
    const w = weight[key] ?? 1.0;
    score += s.base_stat * w;
  }
  // Normalize to roughly 0-100
  return clamp(Math.round((score / 800) * 100), 1, 100);
}

function useLocalStorage(key, initial) {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch (err) {
      console.log(err);
    }
  }, [key, state]);
  return [state, setState];
}

/* Small presentational Pokeball SVG (inline, avoids external icon deps) */
function PokeballSVG({ className = "h-5 w-5" }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden>
      <circle cx="24" cy="24" r="22" fill="#fff" opacity="0.06" />
      <path d="M6 24a18 18 0 0 1 36 0" fill="#ef4444" />
      <path d="M6 24a18 18 0 0 0 36 0" fill="#fff" />
      <circle cx="24" cy="24" r="6" fill="#fff" />
      <circle cx="24" cy="24" r="4" fill="#111827" />
      <path
        d="M6 24h36"
        stroke="#111827"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function App() {
  const [list, setList] = useState([]);
  const [nextUrl, setNextUrl] = useState(`${API_BASE}/pokemon?limit=20`);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [caught, setCaught] = useLocalStorage("caught_pokemon_v1", []);
  const [gameMode, setGameMode] = useState(false);
  const [gameRound, setGameRound] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    // initial load
    loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadMore() {
    if (!nextUrl) return;
    setLoading(true);
    try {
      const res = await axios.get(nextUrl);
      const results = res.data.results; // [{name, url}, ...]
      setNextUrl(res.data.next);
      // fetch details in parallel
      const details = await Promise.all(
        results.map(async (r) => {
          try {
            const dr = await axios.get(r.url);
            return {
              id: dr.data.id,
              name: dr.data.name,
              sprite:
                dr.data.sprites?.other?.["official-artwork"]?.front_default ||
                dr.data.sprites?.front_default ||
                "",
              types: dr.data.types.map((t) => t.type.name),
              stats: dr.data.stats,
            };
          } catch {
            return null;
          }
        })
      );
      setList((s) => {
        const merged = [...s, ...details.filter(Boolean)];
        const unique = merged.filter(
          (item, index, self) =>
            index === self.findIndex((p) => p.id === item.id)
        );
        return unique;
      });
    } catch (e) {
      console.error(e);
      setError("Gagal mengambil daftar Pokemon");
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    if (!search) return list;
    return list.filter((p) => p.name.includes(search.toLowerCase()));
  }, [list, search]);

  async function openDetail(name) {
    setError(null);
    try {
      const res = await axios.get(`${API_BASE}/pokemon/${name}`);
      const d = res.data;
      setSelected({
        id: d.id,
        name: d.name,
        sprite:
          d.sprites?.other?.["official-artwork"]?.front_default ||
          d.sprites.front_default ||
          "",
        types: d.types.map((t) => t.type.name),
        stats: d.stats,
        abilities: d.abilities.map((a) => a.ability.name),
        weight: d.weight,
        height: d.height,
        moves: d.moves.slice(0, 12).map((m) => m.move.name),
      });
    } catch (e) {
      console.error(e);
      setError("Gagal ambil detail Pokemon");
    }
  }

  function closeDetail() {
    setSelected(null);
  }

  function tryCatch(pokemon) {
    // pokemon should include stats (if called from detail) or not
    const hpStat =
      pokemon.stats?.find((s) => s.stat.name === "hp")?.base_stat ?? 50;
    const baseChance = clamp(80 - hpStat * 0.3, 10, 80); // lower HP -> higher chance
    const roll = Math.random() * 100;
    const success = roll < baseChance;
    if (success) {
      setCaught((prev) => {
        if (prev.find((p) => p.id === pokemon.id)) return prev;
        return [
          ...prev,
          { id: pokemon.id, name: pokemon.name, sprite: pokemon.sprite },
        ];
      });
    }
    return success;
  }

  async function startGame() {
    setGameMode(true);
    if (list.length < 8 && nextUrl) await loadMore();
    const pool = list.slice();
    if (pool.length < 4) {
      setError("Butuh setidaknya 4 Pokémon ter-load untuk game");
      setGameMode(false);
      return;
    }
    const answer = pool[Math.floor(Math.random() * pool.length)];
    const choices = [answer];
    while (choices.length < 4) {
      const c = pool[Math.floor(Math.random() * pool.length)];
      if (!choices.find((x) => x.id === c.id)) choices.push(c);
    }
    // shuffle
    for (let i = choices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [choices[i], choices[j]] = [choices[j], choices[i]];
    }
    setGameRound({ answer, choices });
  }

  function endGame() {
    setGameMode(false);
    setGameRound(null);
  }

  function renderTypes(types) {
    return (
      <div className="flex gap-2">
        {types.map((t) => (
          <span
            key={t}
            className="rounded-full bg-white/6 px-3 py-1 text-xs font-medium"
          >
            {t}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-black text-white">
      <div className="mx-auto max-w-7xl p-6">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-red-500/80 flex items-center justify-center">
              <PokeballSVG className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Playing Pokemon</h1>
              <p className="text-sm text-white/70">
                Browse, evaluate, play & catch Pokémon
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => startGame()}
              className="rounded-full bg-white/5 px-4 py-2 text-sm hover:bg-white/6"
            >
              Play Game
            </button>

            <div className="rounded-2xl border border-white/10 bg-white/3 px-3 py-2">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-white/70" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search pokemon..."
                  className="bg-transparent text-sm placeholder:text-white/60 outline-none"
                />
              </div>
            </div>
          </div>
        </header>

        <main className="mt-8 grid gap-6 md:grid-cols-12">
          {/* List */}
          <section className="md:col-span-9">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((p) => (
                <motion.article
                  key={p.id}
                  layout
                  whileHover={{ scale: 1.03 }}
                  className="rounded-2xl border border-white/8 bg-white/2 p-4"
                >
                  <div className="flex items-center gap-4">
                    <img
                      src={p.sprite}
                      alt={p.name}
                      className="h-16 w-16 object-contain"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className="capitalize font-semibold">{p.name}</h3>
                        <div className="text-sm text-white/60">#{p.id}</div>
                      </div>
                      <div className="mt-2">{renderTypes(p.types)}</div>
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          onClick={() => openDetail(p.name)}
                          className="rounded-full border border-white/10 px-3 py-1 text-sm"
                        >
                          Detail
                        </button>

                        <button
                          onClick={async () => {
                            try {
                              const res = await axios.get(
                                `${API_BASE}/pokemon/${p.name}`
                              );
                              const d = res.data;
                              const success = tryCatch({
                                id: d.id,
                                name: d.name,
                                sprite: d.sprites.front_default || "",
                                stats: d.stats,
                              });
                              alert(
                                success
                                  ? `Congrats! You caught ${d.name}`
                                  : `Oh no! ${d.name} escaped.`
                              );
                            } catch {
                              alert("Failed to fetch pokemon details");
                            }
                          }}
                          className="rounded-full bg-red-500/80 px-3 py-1 text-sm font-medium"
                        >
                          Catch
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.article>
              ))}
            </div>

            <div className="mt-6 flex items-center justify-center gap-3">
              {nextUrl ? (
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="rounded-full bg-white text-black font-medium px-4 py-2"
                >
                  {loading ? "Loading..." : "Load more"}
                </button>
              ) : (
                <div className="text-sm text-white/60">No more Pokémon</div>
              )}
            </div>
          </section>

          {/* Sidebar */}
          <aside className="md:col-span-3 space-y-6">
            <div className="rounded-2xl border border-white/8 bg-white/3 p-4">
              <h4 className="font-semibold">Caught Pokémon</h4>
              <p className="text-sm text-white/60">
                Saved locally in your browser
              </p>
              <div className="mt-3 grid gap-2">
                {caught.length === 0 ? (
                  <div className="text-sm text-white/60">
                    You haven't caught any yet.
                  </div>
                ) : (
                  caught.map((c) => (
                    <div key={c.id} className="flex items-center gap-3">
                      <img
                        src={c.sprite}
                        alt={c.name}
                        className="h-10 w-10 object-contain"
                      />
                      <div className="flex-1">
                        <div className="capitalize font-medium">{c.name}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/8 bg-white/3 p-4">
              <h4 className="font-semibold">Quick Evaluation</h4>
              <p className="text-sm text-white/60">
                Enter a Pokémon name to compute its "power score"
              </p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const name = e.target.elements.pokeval.value
                    .trim()
                    .toLowerCase();
                  if (!name) return alert("Enter a name");
                  try {
                    const res = await axios.get(`${API_BASE}/pokemon/${name}`);
                    const score = computePowerScore(res.data.stats);
                    alert(`${name} — Power score: ${score}/100`);
                  } catch {
                    alert("Pokemon not found");
                  }
                }}
                className="mt-3 flex gap-2"
              >
                <input
                  name="pokeval"
                  className="rounded-lg bg-white text-black px-3 py-2 outline-none w-full"
                  placeholder="e.g. pikachu"
                />
                <button className="rounded-lg bg-indigo-600 px-4 py-2">
                  Eval
                </button>
              </form>
            </div>

            <div className="rounded-2xl border border-white/8 bg-white/3 p-4">
              <h4 className="font-semibold">About</h4>
              <p className="text-sm text-white/60">
                Interactive demo using PokeAPI. Catch, evaluate and play a small
                guessing game.
              </p>
            </div>
          </aside>
        </main>

        {/* Detail Modal */}
        <AnimatePresence>
          {selected && (
            <motion.div
              key={selected.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="max-w-3xl rounded-2xl bg-slate-900 p-6 shadow-2xl"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <img
                      src={selected.sprite}
                      alt={selected.name}
                      className="h-28 w-28 object-contain"
                    />
                    <div>
                      <h3 className="text-2xl capitalize font-semibold">
                        {selected.name}
                      </h3>
                      <div className="text-sm text-white/60">
                        #{selected.id}
                      </div>
                      <div className="mt-2">{renderTypes(selected.types)}</div>
                    </div>
                  </div>

                  <button
                    onClick={closeDetail}
                    className="rounded-full bg-white/3 p-2"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <h4 className="font-semibold">Stats</h4>
                    <div className="mt-2 space-y-2">
                      {selected.stats.map((s) => (
                        <div key={s.stat.name} className="text-sm">
                          <div className="flex items-center justify-between">
                            <div className="capitalize">{s.stat.name}</div>
                            <div className="text-sm text-white/60">
                              {s.base_stat}
                            </div>
                          </div>
                          <div className="mt-1 h-2 w-full rounded-full bg-white/6">
                            <div
                              style={{
                                width: `${clamp(
                                  (s.base_stat / 255) * 100,
                                  0,
                                  100
                                )}%`,
                              }}
                              className="h-full rounded-full bg-green-500/80"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold">About & Moves</h4>
                    <p className="mt-2 text-sm text-white/60">
                      Weight: {selected.weight} • Height: {selected.height}
                    </p>

                    <div className="mt-3">
                      <div className="text-sm text-white/70">Abilities</div>
                      <div className="mt-1 flex gap-2">
                        {selected.abilities.map((a) => (
                          <span
                            key={a}
                            className="rounded-full bg-white/6 px-2 py-1 text-xs"
                          >
                            {a}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="text-sm text-white/70">Moves</div>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {selected.moves.map((m) => (
                          <span
                            key={m}
                            className="rounded-full bg-white/6 px-2 py-1 text-xs"
                          >
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-end gap-3">
                  <button
                    onClick={() => {
                      const score = computePowerScore(selected.stats);
                      alert(`${selected.name} — Power score: ${score}/100`);
                    }}
                    className="rounded-full border border-white/10 px-4 py-2"
                  >
                    Evaluate
                  </button>

                  <button
                    onClick={() => {
                      const success = tryCatch(selected);
                      alert(
                        success
                          ? `Caught ${selected.name}!`
                          : `${selected.name} escaped.`
                      );
                      closeDetail();
                    }}
                    className="rounded-full bg-red-500/80 px-4 py-2 text-sm font-medium"
                  >
                    Catch
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Game Modal */}
        <AnimatePresence>
          {gameMode && gameRound && (
            <motion.div className="fixed inset-0 z-60 flex items-center justify-center p-4">
              <motion.div
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 40, opacity: 0 }}
                className="max-w-2xl rounded-2xl bg-slate-900 p-6 shadow-2xl"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold">Guess the Pokémon</h3>
                  <button
                    onClick={endGame}
                    className="rounded-full bg-white/3 p-2"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4 grid gap-4">
                  <div className="flex items-center justify-center">
                    {/* silhouette: darkened image */}
                    <img
                      src={gameRound.answer.sprite}
                      alt="silhouette"
                      className="h-44 w-44 object-contain filter brightness-0 contrast-200"
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {gameRound.choices.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          const correct = c.id === gameRound.answer.id;
                          alert(
                            correct
                              ? "Correct! 🎉"
                              : `Wrong — it was ${gameRound.answer.name}`
                          );
                          if (correct) {
                            setCaught((prev) => {
                              if (prev.find((p) => p.id === c.id)) return prev;
                              return [
                                ...prev,
                                { id: c.id, name: c.name, sprite: c.sprite },
                              ];
                            });
                          }
                          endGame();
                        }}
                        className="rounded-2xl border border-white/8 bg-white/3 p-4 text-left"
                      >
                        <div className="flex items-center gap-4">
                          <img
                            src={c.sprite}
                            alt={c.name}
                            className="h-12 w-12 object-contain"
                          />
                          <div>
                            <div className="capitalize font-medium">
                              {c.name}
                            </div>
                            <div className="text-xs text-white/60">#{c.id}</div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {error && <div className="mt-6 text-center text-red-400">{error}</div>}

        <footer className="mt-10 w-full border-t border-white/6 py-6 text-center text-sm text-white/60">
          Built with ❤️ using PokeAPI
        </footer>
      </div>
    </div>
  );
}
