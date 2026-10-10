import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Admin.css";
import { api } from "../api";

const createEmptyMovie = () => ({
  title: "",
  url: "",
  cbc: "",
});

function Admin() {
  const navigate = useNavigate();

  // ==========================================
  // ADD MOVIES STATE
  // ==========================================

  const [movieCount, setMovieCount] = useState("");
  const [movies, setMovies] = useState([]);

  const [loading, setLoading] = useState(false);

  // ==========================================
  // MESSAGE STATE
  // ==========================================

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // ==========================================
  // EXISTING MOVIES STATE
  // ==========================================

  const [existingMovies, setExistingMovies] = useState([]);
  const [loadingMovies, setLoadingMovies] = useState(false);
  const [deletingMovieId, setDeletingMovieId] = useState(null);

  // ==========================================
  // CHECK ADMIN LOGIN
  // ==========================================

  useEffect(() => {
    const token = localStorage.getItem("adminToken");

    if (!token) {
      navigate("/admin/login", {
        replace: true,
      });

      return;
    }

    loadExistingMovies();
  }, [navigate]);

  // ==========================================
  // LOAD EXISTING MOVIES
  // ==========================================

  const loadExistingMovies = async () => {
    try {
      setLoadingMovies(true);
      setError("");

      const response = await fetch(api("/api/videos"), {
        cache: "no-store",
      });

      let data = {};

      try {
        data = await response.json();
      } catch {
        data = {};
      }

      console.log("MOVIES RESPONSE:", data);

      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem("adminToken");
        localStorage.removeItem("adminUser");

        navigate("/admin/login", {
          replace: true,
        });

        return;
      }

      if (!response.ok) {
        throw new Error(data.message || "Failed to load movies");
      }

      // Your backend may return:
      // []
      // OR { videos: [] }
      // OR { movies: [] }

      if (Array.isArray(data)) {
        setExistingMovies(data);
      } else if (Array.isArray(data.videos)) {
        setExistingMovies(data.videos);
      } else if (Array.isArray(data.movies)) {
        setExistingMovies(data.movies);
      } else {
        setExistingMovies([]);
      }
    } catch (error) {
      console.error("LOAD MOVIES ERROR:", error);

      setError(error.message || "Failed to load existing movies.");
    } finally {
      setLoadingMovies(false);
    }
  };

  // ==========================================
  // LOGOUT
  // ==========================================

  const handleLogout = () => {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminUser");

    navigate("/admin/login", {
      replace: true,
    });
  };

  // ==========================================
  // CREATE MOVIE SLOTS
  // ==========================================

  const createMovieSlots = () => {
    setError("");
    setSuccess("");

    const count = Number(movieCount);

    if (!Number.isInteger(count) || count < 1) {
      setError("Please enter a valid number of movies.");
      return;
    }

    if (count > 500) {
      setError("You can add a maximum of 500 movies at once.");
      return;
    }

    const newMovies = Array.from({ length: count }, () => createEmptyMovie());

    setMovies(newMovies);
  };

  // ==========================================
  // UPDATE MOVIE FORM
  // ==========================================

  const updateMovie = (index, field, value) => {
    setMovies((previousMovies) =>
      previousMovies.map((movie, movieIndex) =>
        movieIndex === index
          ? {
              ...movie,
              [field]: value,
            }
          : movie,
      ),
    );
  };

  // ==========================================
  // RESET FORM
  // ==========================================

  const resetForm = () => {
    setMovieCount("");
    setMovies([]);
  };

  // ==========================================
  // DELETE MOVIE
  // ==========================================

  const handleDeleteMovie = async (movie) => {
    if (!movie?._id) {
      setError("Unable to delete this movie because its ID is missing.");
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to permanently delete "${movie.title}"?\n\n` +
        "This will remove the movie from the library.",
    );

    if (!confirmed) {
      return;
    }

    const token = localStorage.getItem("adminToken");

    if (!token) {
      navigate("/admin/login", {
        replace: true,
      });

      return;
    }

    try {
      setDeletingMovieId(movie._id);
      setError("");
      setSuccess("");

      console.log("DELETING VIDEO:", movie._id);

      const response = await fetch(api(`/api/videos/${movie._id}`), {
        method: "DELETE",

        headers: {
          Authorization: `Bearer ${token}`,
        },

        cache: "no-store",
      });

      let data = {};

      try {
        data = await response.json();
      } catch {
        data = {};
      }

      console.log("DELETE RESPONSE:", {
        status: response.status,
        data,
      });

      // ========================================
      // ADMIN SESSION EXPIRED
      // ========================================

      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem("adminToken");
        localStorage.removeItem("adminUser");

        navigate("/admin/login", {
          replace: true,
        });

        return;
      }

      // ========================================
      // DELETE FAILED
      // ========================================

      if (!response.ok) {
        throw new Error(data.message || "Failed to delete movie");
      }

      // ========================================
      // REMOVE FROM FRONTEND
      // ========================================

      setExistingMovies((previousMovies) =>
        previousMovies.filter(
          (existingMovie) => existingMovie._id !== movie._id,
        ),
      );

      setSuccess(`"${movie.title}" deleted successfully.`);
    } catch (error) {
      console.error("DELETE MOVIE ERROR:", error);

      setError(error.message || "Failed to delete movie.");
    } finally {
      setDeletingMovieId(null);
    }
  };

  // ==========================================
  // ADD MOVIES
  // ==========================================

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");
    setSuccess("");

    const token = localStorage.getItem("adminToken");

    if (!token) {
      navigate("/admin/login", {
        replace: true,
      });

      return;
    }

    if (movies.length === 0) {
      setError("Please enter the number of movies first.");

      return;
    }

    // ========================================
    // VALIDATE MOVIES
    // ========================================

    const moviesToAdd = [];

    for (let index = 0; index < movies.length; index++) {
      const movie = movies[index];

      const title = movie.title.trim();
      const url = movie.url.trim();
      const cbc = movie.cbc.trim();

      const hasAnything = title !== "" || url !== "" || cbc !== "";

      // Empty slot is allowed
      if (!hasAnything) {
        continue;
      }

      if (!title) {
        setError(`Movie ${index + 1}: title is required.`);

        return;
      }

      if (!url) {
        setError(`Movie ${index + 1}: video URL is required.`);

        return;
      }

      if (!cbc) {
        setError(`Movie ${index + 1}: CBC rating is required.`);

        return;
      }

      moviesToAdd.push({
        title,
        url,
        cbc,
      });
    }

    if (moviesToAdd.length === 0) {
      setError("Please add at least one movie.");
      return;
    }

    // ========================================
    // ADD MOVIES
    // ========================================

    setLoading(true);

    let addedCount = 0;

    try {
      for (const movie of moviesToAdd) {
        const response = await fetch(api("/api/videos/create-watchable"), {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },

          body: JSON.stringify({
            signedFileUrl: movie.url,
            sourceUrl: movie.url,
            title: movie.title,
            cbc: movie.cbc,
          }),
        });

        let data = {};

        try {
          data = await response.json();
        } catch {
          data = {};
        }

        console.log("CREATE MOVIE RESPONSE:", data);

        // ======================================
        // ADMIN SESSION EXPIRED
        // ======================================

        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem("adminToken");
          localStorage.removeItem("adminUser");

          navigate("/admin/login", {
            replace: true,
          });

          return;
        }

        // ======================================
        // CREATE FAILED
        // ======================================

        if (!response.ok) {
          throw new Error(data.message || `Failed to add "${movie.title}"`);
        }

        addedCount++;
      }

      // ========================================
      // SUCCESS
      // ========================================

      setSuccess(
        `${addedCount} ${
          addedCount === 1 ? "movie" : "movies"
        } added successfully.`,
      );

      resetForm();

      // Refresh library
      await loadExistingMovies();
    } catch (error) {
      console.error("CREATE MOVIES ERROR:", error);

      setError(error.message || "Failed to add movies.");
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // ADMIN USER
  // ==========================================

  let adminUser = null;

  try {
    adminUser = JSON.parse(localStorage.getItem("adminUser") || "null");
  } catch {
    adminUser = null;
  }

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <main className="admin-page">
      <div className="admin-container">
        {/* ======================================
            HEADER
        ====================================== */}

        <header className="admin-header">
          <div className="admin-brand">
            <div className="admin-logo">▶</div>

            <div>
              <h1>Admin Dashboard</h1>

              <p>Manage your movie library</p>
            </div>
          </div>

          <div className="admin-account">
            <div className="admin-user">
              <span className="admin-user-label">Logged in as</span>

              <strong>{adminUser?.username || "Admin"}</strong>
            </div>

            <button
              className="logout-button"
              onClick={handleLogout}
              type="button"
            >
              Logout
            </button>
          </div>
        </header>

        {/* ======================================
            ADD MOVIES
        ====================================== */}

        <section className="admin-card">
          <div className="admin-card-header">
            <div>
              <span className="section-label">ADMIN</span>

              <h2>Add Movies</h2>

              <p>Add movies using their direct video URL.</p>
            </div>
          </div>

          {/* MOVIE COUNT */}

          {!loading && movies.length === 0 && (
            <div className="movie-count-section">
              <div className="form-group">
                <label htmlFor="movie-count">
                  How many movies do you want to add?
                </label>

                <input
                  id="movie-count"
                  type="number"
                  min="1"
                  max="500"
                  value={movieCount}
                  onChange={(event) => setMovieCount(event.target.value)}
                  placeholder="Example: 5"
                />

                <span className="input-help">
                  Enter any number from 1 to 500.
                </span>
              </div>

              <button
                className="add-movie-button"
                type="button"
                onClick={createMovieSlots}
              >
                <span>＋</span>
                Create Movie Slots
              </button>
            </div>
          )}

          {/* MOVIE FORM */}

          {movies.length > 0 && (
            <form className="admin-form" onSubmit={handleSubmit}>
              <div className="movie-count-info">
                <strong>
                  {movies.length} {movies.length === 1 ? "Movie" : "Movies"}
                </strong>

                <button
                  type="button"
                  className="change-count-button"
                  onClick={() => {
                    if (loading) return;

                    setMovies([]);
                    setMovieCount("");
                    setError("");
                    setSuccess("");
                  }}
                  disabled={loading}
                >
                  Change Number
                </button>
              </div>

              <div className="movie-slots">
                {movies.map((movie, index) => (
                  <div className="movie-slot" key={index}>
                    <div className="movie-slot-header">
                      <div>
                        <span className="movie-slot-number">
                          Movie {index + 1}
                        </span>

                        <h3>
                          {index === 0 ? "Required Movie" : "Optional Movie"}
                        </h3>
                      </div>
                    </div>

                    {/* TITLE */}

                    <div className="form-group">
                      <label htmlFor={`movie-title-${index}`}>
                        Movie Title
                      </label>

                      <input
                        id={`movie-title-${index}`}
                        type="text"
                        value={movie.title}
                        onChange={(event) =>
                          updateMovie(index, "title", event.target.value)
                        }
                        placeholder="Enter movie title"
                        disabled={loading}
                      />
                    </div>

                    {/* URL */}

                    <div className="form-group">
                      <label htmlFor={`movie-url-${index}`}>Video URL</label>

                      <input
                        id={`movie-url-${index}`}
                        type="url"
                        value={movie.url}
                        onChange={(event) =>
                          updateMovie(index, "url", event.target.value)
                        }
                        placeholder="Paste direct signed video URL"
                        disabled={loading}
                      />

                      <span className="input-help">
                        Use the direct signed video download URL.
                      </span>
                    </div>

                    {/* CBC */}

                    <div className="form-group">
                      <label htmlFor={`movie-cbc-${index}`}>CBC Rating</label>

                      <select
                        id={`movie-cbc-${index}`}
                        value={movie.cbc}
                        onChange={(event) =>
                          updateMovie(index, "cbc", event.target.value)
                        }
                        disabled={loading}
                      >
                        <option value="">Select rating</option>

                        <option value="U">U</option>

                        <option value="U/A">U/A</option>

                        <option value="A">A</option>

                        <option value="R">R</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>

              {/* ADD BUTTON */}

              <button
                className="add-movie-button"
                type="submit"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="button-spinner" />
                    Adding Movies...
                  </>
                ) : (
                  <>
                    <span>＋</span>
                    Add Movies
                  </>
                )}
              </button>
            </form>
          )}

          {/* MESSAGES */}

          {error && <div className="admin-message error">{error}</div>}

          {success && <div className="admin-message success">{success}</div>}
        </section>

        {/* ======================================
            EXISTING MOVIES
        ====================================== */}

        <section className="admin-card">
          <div className="admin-card-header">
            <div>
              <span className="section-label">LIBRARY</span>

              <h2>Existing Movies</h2>

              <p>Movies currently available to users.</p>
            </div>
          </div>

          {/* LOADING */}

          {loadingMovies ? (
            <div className="admin-message">Loading movies...</div>
          ) : existingMovies.length === 0 ? (
            <div className="admin-message">No movies have been added yet.</div>
          ) : (
            <div className="existing-movies-list">
              {existingMovies.map((movie) => {
                const isDeleting = deletingMovieId === movie._id;

                return (
                  <div className="existing-movie-item" key={movie._id}>
                    {/* MOVIE INFO */}

                    <div className="existing-movie-info">
                      <h3>{movie.title || "Untitled Movie"}</h3>

                      <div className="existing-movie-details">
                        <span>Rating: {movie.cbc || "Not set"}</span>

                        <span>
                          Format: {(movie.format || "mp4").toUpperCase()}
                        </span>

                        {movie.duration > 0 && (
                          <span>
                            Duration: {Math.round(movie.duration)} sec
                          </span>
                        )}
                      </div>
                    </div>

                    {/* DELETE BUTTON */}

                    <button
                      type="button"
                      className="delete-movie-button"
                      onClick={() => handleDeleteMovie(movie)}
                      disabled={isDeleting || loading}
                    >
                      {isDeleting ? (
                        <>
                          <span className="button-spinner" />
                          Deleting...
                        </>
                      ) : (
                        <>🗑 Delete</>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ======================================
            BACK HOME
        ====================================== */}

        <button
          className="back-home-button"
          onClick={() => navigate("/")}
          type="button"
        >
          ← Movie Library
        </button>
      </div>
    </main>
  );
}

export default Admin;
