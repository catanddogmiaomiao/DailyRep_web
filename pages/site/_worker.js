// Keep the public dailyRep address independent from other project domains.
// Preserve the original origin and cookies so the existing API's auth/CSRF checks apply.
export default {
  async fetch(request, env) {
    return env.DAILYREP.fetch(request);
  }
};
