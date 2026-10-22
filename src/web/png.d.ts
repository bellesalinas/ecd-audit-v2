// The web build inlines PNGs as data: URIs (esbuild dataurl loader).
declare module "*.png" {
  const dataUri: string;
  export default dataUri;
}
