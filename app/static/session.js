// The API key lives only in this closure (browser memory). It is never written to storage,
// a cookie, the URL or the DOM, and it is only ever sent to the /patients routes.
// `fetchFn` is injected so the behaviour can be tested without a browser.

export class SessionError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // "invalid-key" | "unavailable"
  }
}

const PATIENT_ID = /^P\d{3,4}$/;

export function createSession(fetchFn) {
  let key = null;

  async function request(path, candidate) {
    let res;
    try {
      res = await fetchFn(path, {
        method: "GET",
        headers: { "x-api-key": candidate },
        cache: "no-store",
        credentials: "omit", // never send or accept cookies
        redirect: "error",
      });
    } catch {
      throw new SessionError("unavailable", "Could not reach the API.");
    }
    if (res.status === 403) throw new SessionError("invalid-key", "That key was not accepted.");
    if (!res.ok) throw new SessionError("unavailable", `The API answered ${res.status}.`);
    return res.json();
  }

  return {
    get active() {
      return key !== null;
    },
    // Validates the key against /patients. The key is kept only if the API accepts it.
    async login(candidate) {
      if (typeof candidate !== "string" || candidate.length === 0) {
        throw new SessionError("invalid-key", "Enter the API key.");
      }
      const patients = await request("/patients", candidate);
      key = candidate;
      return patients;
    },
    async listPatients() {
      if (key === null) throw new SessionError("invalid-key", "Not signed in.");
      return request("/patients", key);
    },
    async getPatient(id) {
      if (key === null) throw new SessionError("invalid-key", "Not signed in.");
      if (!PATIENT_ID.test(id)) throw new SessionError("unavailable", "Unknown patient id.");
      return request(`/patients/${id}`, key);
    },
    logout() {
      key = null;
    },
  };
}
