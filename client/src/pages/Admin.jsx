import { useCallback, useEffect, useState } from "react";
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
  // UPLOAD PROGRESS STATE
  // ==========================================

  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [totalToUpload, setTotalToUpload] = useState(0);
  const [currentMovie, setCurrentMovie] = useState("");

  // ==========================================
  // LOAD EXISTING MOVIES
  // ==========================================

  const loadExistingMovies = useCallback(async () => {
    const token = localStorage.getItem("adminToken");

    if (!token) {
      localStorage.removeItem("adminUser");
      navigate("/admin/login", { replace: true });
      return;
    }

    try {
      setLoadingMovies(true);
      setError("");

      const response = await fetch(api("/api/videos"), {
        method: "GET",
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

      // Handle expired or invalid admin sessions.
      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem("adminToken");
        localStorage.removeItem("adminUser");

        navigate("/admin/login", { replace: true });
        return;
      }

      if (!response.ok) {
        throw new Error(data.message || "Failed to load movies.");
      }

      // Support different backend response formats.
      if (Array.isArray(data)) {
        setExistingMovies(data);
      } else if (Array.isArray(data.videos)) {
        setExistingMovies(data.videos);
      } else if (Array.isArray(data.movies)) {
        setExistingMovies(data.movies);
      } else {
        setExistingMovies([]);
      }
    } catch (err) {
      console.error("LOAD MOVIES ERROR:", err);
      setError(err.message || "Failed to load existing movies.");
    } finally {
      setLoadingMovies(false);
    }
  }, [navigate]);

  // ==========================================
  // CHECK ADMIN LOGIN
  // ==========================================

  useEffect(() => {
    const token = localStorage.getItem("adminToken");

    if (!token) {
      navigate("/admin/login", { replace: true });
      return;
    }

    loadExistingMovies();
  }, [navigate, loadExistingMovies]);

  // ==========================================
  // LOGOUT
  // ==========================================

  const handleLogout = () => {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminUser");

    navigate("/admin/login", { replace: true });
  };

  // ==========================================
  // CREATE MOVIE SLOTS
  // ==========================================

  const createMovieSlots = () => {
    setError("");
    setSuccess("");

    const count = Number(movieCount);

    if (!Number.isInteger(count) || count < 1 || count > 500) {
      setError("Please enter a valid number of movies between 1 and 500.");
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
      localStorage.removeItem("adminUser");
      navigate("/admin/login", { replace: true });
      return;
    }

    try {
      setDeletingMovieId(movie._id);
      setError("");
      setSuccess("");

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

      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem("adminToken");
        localStorage.removeItem("adminUser");

        navigate("/admin/login", { replace: true });
        return;
      }

      if (!response.ok) {
        throw new Error(data.message || "Failed to delete movie.");
      }

      // Remove the deleted movie from the UI.
      setExistingMovies((previousMovies) =>
        previousMovies.filter(
          (existingMovie) => existingMovie._id !== movie._id,
        ),
      );

      setSuccess(`"${movie.title || "Movie"}" deleted successfully.`);
    } catch (err) {
      console.error("DELETE MOVIE ERROR:", err);
      setError(err.message || "Failed to delete movie.");
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
      localStorage.removeItem("adminUser");
      navigate("/admin/login", { replace: true });
      return;
    }

    if (movies.length === 0) {
      setError("Please enter the number of movies first.");
      return;
    }

    // Validate all non-empty movie slots before uploading.
    const moviesToAdd = [];

    for (let index = 0; index < movies.length; index++) {
      const movie = movies[index];

      const title = movie.title.trim();
      const url = movie.url.trim();
      const cbc = movie.cbc.trim();

      const hasAnything = title !== "" || url !== "" || cbc !== "";

      // Allow unused movie slots.
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

      // Validate URL format.
      try {
        const parsedUrl = new URL(url);

        if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
          setError(
            `Movie ${index + 1}: please enter a valid HTTP or HTTPS URL.`,
          );
          return;
        }
      } catch {
        setError(`Movie ${index + 1}: please enter a valid video URL.`);
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

    // Initialize upload progress.
    setLoading(true);
    setUploadProgress(0);
    setUploadedCount(0);
    setTotalToUpload(moviesToAdd.length);
    setCurrentMovie("");

    let addedCount = 0;

    try {
      // Upload movies sequentially.
      for (let index = 0; index < moviesToAdd.length; index++) {
        const movie = moviesToAdd[index];

        setCurrentMovie(movie.title);

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

        // Stop if the admin session has expired.
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem("adminToken");
          localStorage.removeItem("adminUser");

          navigate("/admin/login", { replace: true });
          return;
        }

        if (!response.ok) {
          throw new Error(data.message || `Failed to add "${movie.title}".`);
        }

        addedCount++;

        setUploadedCount(addedCount);

        setUploadProgress(Math.round((addedCount / moviesToAdd.length) * 100));
      }

      setSuccess(
        `${addedCount} ${
          addedCount === 1 ? "movie" : "movies"
        } added successfully.`,
      );

      resetForm();

      // Refresh the library after adding movies.
      await loadExistingMovies();
    } catch (err) {
      console.error("CREATE MOVIES ERROR:", err);

      if (addedCount > 0) {
        setError(
          `${err.message || "An error occurred."} ` +
            `${addedCount} ${
              addedCount === 1 ? "movie was" : "movies were"
            } added before the error.`,
        );
      } else {
        setError(err.message || "Failed to add movies.");
      }

      // Refresh in case some movies were created successfully.
      if (addedCount > 0) {
        await loadExistingMovies();
      }
    } finally {
      setLoading(false);
      setCurrentMovie("");
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
        {/* HEADER */}

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

        {/* ADD MOVIES */}

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

                    {/* VIDEO URL */}

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

                    {/* CBC RATING */}

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

          {/* UPLOAD PROGRESS */}

          {loading && (
            <div className="admin-progress" role="status" aria-live="polite">
              <div className="progress-header">
                <div>
                  <h3>Adding Movies</h3>

                  <span>
                    {currentMovie
                      ? `Processing: ${currentMovie}`
                      : "Preparing upload..."}
                  </span>
                </div>

                <strong>{uploadProgress}%</strong>
              </div>

              <div
                className="progress-track"
                role="progressbar"
                aria-label="Movies added"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={uploadProgress}
              >
                <div
                  className="progress-fill"
                  style={{
                    width: `${uploadProgress}%`,
                  }}
                />
              </div>

              <div className="progress-stats">
                <span>
                  Movies added
                  <strong>
                    {uploadedCount} / {totalToUpload}
                  </strong>
                </span>

                <span>
                  Remaining
                  <strong>{totalToUpload - uploadedCount}</strong>
                </span>

                <span>
                  Status
                  <strong>
                    {uploadProgress === 100 ? "Completed" : "In progress"}
                  </strong>
                </span>
              </div>
            </div>
          )}

          {/* MESSAGES */}

          {error && (
            <div className="admin-message error" role="alert">
              {error}
            </div>
          )}

          {success && (
            <div className="admin-message success" role="status">
              {success}
            </div>
          )}
        </section>

        {/* EXISTING MOVIES */}

        <section className="admin-card">
          <div className="admin-card-header">
            <div>
              <span className="section-label">LIBRARY</span>
              <h2>Existing Movies</h2>
              <p>Movies currently available to users.</p>
            </div>

            <button
              type="button"
              className="change-count-button"
              onClick={loadExistingMovies}
              disabled={loadingMovies || loading}
            >
              {loadingMovies ? "Refreshing..." : "Refresh Movies"}
            </button>
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
                    <div className="existing-movie-info">
                      <h3>{movie.title || "Untitled Movie"}</h3>

                      <div className="existing-movie-details">
                        <span>Rating: {movie.cbc || "Not set"}</span>

                        <span>
                          Format: {(movie.format || "mp4").toUpperCase()}
                        </span>

                        {Number(movie.duration) > 0 && (
                          <span>
                            Duration: {Math.round(Number(movie.duration))} sec
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

        {/* BACK HOME */}

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
