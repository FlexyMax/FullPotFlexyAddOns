declare module "swagger-ui-react" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type SwaggerUIProps = Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SwaggerUI: (props: SwaggerUIProps) => any;
  export default SwaggerUI;
}

declare module "swagger-ui-react/swagger-ui.css";
