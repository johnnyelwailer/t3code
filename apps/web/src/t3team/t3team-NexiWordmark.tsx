/**
 * The full "nexi" wordmark, matching Nexi Portal's `NexiWordmark`.
 *
 * Path data is verbatim from `shared/packs/nexplore-global/assets/nexi-wordmark.svg` (the same
 * asset the portal renders), so both surfaces show one identical mark.
 *
 * It is INLINE rather than served through `T3TeamPackBrandImage` on purpose: the asset is authored
 * with `fill="currentColor"`, and an `<img src="data:…">` cannot inherit `currentColor`. Inlining
 * lets it take the surrounding text colour — over stage art that is `--stage-nx-label`, so the
 * wordmark tracks the ground palette automatically and needs no light/dark asset pair.
 */
export function T3TeamNexiWordmark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 59.334 21.029"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M11.569,4.572c-1.156,0-2.11.221-2.861.665-.755.444-1.398,1.057-1.934,1.84,0-1.179-.956-2.134-2.134-2.134H0v3.804h2.505v12.098h4.392v-8.663c0-.804.141-1.482.418-2.043.279-.557.665-.974,1.16-1.252.497-.275,1.04-.418,1.64-.418.845,0,1.51.244,1.996.727.483.485.727,1.203.727,2.149v9.499h4.394v-10.426c0-1.896-.523-3.345-1.563-4.347-1.044-.999-2.41-1.499-4.1-1.499ZM27.882,4.572c-1.628,0-3.062.367-4.301,1.098-.337.201-.654.42-.95.661-.787.641-1.424,1.426-1.911,2.355-.669,1.278-1.004,2.723-1.004,4.331,0,1.589.335,2.991,1.004,4.207.671,1.218,1.619,2.157,2.846,2.816,1.227.66,2.646.989,4.254.989,1.362,0,2.593-.242,3.697-.727,1.104-.483,2.099-1.211,2.985-2.181l-2.458-2.442c-1.036,1.049-2.331,1.576-3.883,1.576-1.362,0-2.399-.388-3.109-1.16-.422-.457-.718-1.051-.888-1.78h10.833v-1.701c0-2.597-.63-4.587-1.887-5.97-1.257-1.381-3-2.073-5.228-2.073h0ZM24.117,11.163c.144-.725.409-1.329.795-1.81.114-.142.238-.272.371-.386.592-.517,1.375-.774,2.352-.774,1.01,0,1.763.262,2.258.789.495.525.753,1.252.774,2.181h-6.55ZM52.675,4.943L47.229,4.943L44.167,9.337L41.074,4.943L35.628,4.943L41.538,12.709L35.319,20.845L40.826,20.845L44.167,16.112L47.508,20.845L52.984,20.845L46.796,12.709ZM54.809,4.572H59.334V20.845H54.809ZM59.0715,1.7a1.7,1.7 0 1 1-3.4,0a1.7,1.7 0 1 1 3.4,0Z"
      />
    </svg>
  );
}
