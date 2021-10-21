import {
  AuthorizationType,
  CfnDataSource,
  CfnResolver,
  DynamoDbDataSource,
  FieldLogLevel,
  GraphqlApi,
  GraphqlApiProps,
  MappingTemplate,
  Schema,
} from "@aws-cdk/aws-appsync";
import * as dynamodb from "@aws-cdk/aws-dynamodb";
import {
  Code,
  Function,
  FunctionProps,
  Runtime,
  Tracing,
} from "@aws-cdk/aws-lambda";
import * as cdk from "@aws-cdk/core";
import { join, resolve } from "path";
import * as environment from "./env";
import IAM = require("@aws-cdk/aws-iam");
interface ApiProps extends cdk.StackProps {
  esArn: string;
  esEndPoint: string;
  ddb: dynamodb.Table;
}

export class ApiStack extends cdk.Stack {
  public readonly appSyncLog: string;
  constructor(
    scope: cdk.Construct,
    id: string,
    target: environment.Environments,
    props?: cdk.StackProps
  ) {
    super(scope, id, props);
    const api = new GraphqlApi(this, "GraphqlApi", apiProps(target));
  }
}

const withDDBResolvers = (
  api: GraphqlApi,
  ddbDataSource: DynamoDbDataSource
) => {
  api.createResolver({
    typeName: "Query",
    fieldName: "getProperty",
    dataSource: ddbDataSource,
    requestMappingTemplate: MappingTemplate.fromFile(
      join(
        __dirname,
        "schema",
        "resolvers",
        "public",
        "getProperty" + ".request.vtl"
      )
    ),
    responseMappingTemplate: MappingTemplate.fromFile(
      join(
        __dirname,
        "schema",
        "resolvers",
        "public",
        "getProperty" + ".response.vtl"
      )
    ),
  });
  api.createResolver({
    typeName: "Query",
    fieldName: "listArticleCreators",
    dataSource: ddbDataSource,
    requestMappingTemplate: MappingTemplate.fromFile(
      join(
        __dirname,
        "schema",
        "resolvers",
        "public",
        "listArticleCreators" + ".request.vtl"
      )
    ),
    responseMappingTemplate: MappingTemplate.fromFile(
      join(
        __dirname,
        "schema",
        "resolvers",
        "public",
        "listArticleCreators" + ".response.vtl"
      )
    ),
  });
  api.createResolver({
    typeName: "Query",
    fieldName: "listLocations",
    dataSource: ddbDataSource,
    requestMappingTemplate: MappingTemplate.fromFile(
      join(
        __dirname,
        "schema",
        "resolvers",
        "public",
        "listLocations" + ".request.vtl"
      )
    ),
    responseMappingTemplate: MappingTemplate.fromFile(
      join(
        __dirname,
        "schema",
        "resolvers",
        "public",
        "listLocations" + ".response.vtl"
      )
    ),
  });
  api.createResolver({
    typeName: "Query",
    fieldName: "listTags",
    dataSource: ddbDataSource,
    requestMappingTemplate: MappingTemplate.fromFile(
      join(
        __dirname,
        "schema",
        "resolvers",
        "public",
        "listTags" + ".request.vtl"
      )
    ),
    responseMappingTemplate: MappingTemplate.fromFile(
      join(
        __dirname,
        "schema",
        "resolvers",
        "public",
        "listTags" + ".response.vtl"
      )
    ),
  });
};

const dDBDataSource = (
  api: GraphqlApi,
  target: environment.Environments,
  props: ApiProps
) => {
  return new DynamoDbDataSource(api, "main", {
    api: api,
    table: props.ddb,
    name: "ddb",
    readOnlyAccess: true,
  });
};

class QueryResolverInput {
  stack: ApiStack;
  resolverNames: string[];
  target: environment.Environments;
  functionRole: IAM.PolicyStatement;
  constructor(
    stack: ApiStack,
    resolverNames: string[],
    target: environment.Environments,
    functionRole: IAM.PolicyStatement
  ) {
    this.stack = stack;
    this.resolverNames = resolverNames;
    this.target = target;
    this.functionRole = functionRole;
  }
}

const apiDefaultRole = (
  api: GraphqlApi,
  target: environment.Environments,
  props: ApiProps
) => {
  const polStatement = defaultApiStatement(props);
  const policy = new IAM.Policy(
    api,
    environment.withEnvPrefix(target, "pol-appsync-default"),
    {
      policyName: environment.withEnvPrefix(target, "appsync-default"),
      statements: [polStatement],
    }
  );
  const serviceRole = new IAM.Role(api, "appsyncServiceRole", {
    assumedBy: new IAM.ServicePrincipal("appsync.amazonaws.com"),
    path: "/service-role/",
    roleName: environment.withEnvPrefix(target, "appsyncDefaultRole"),
  });
  serviceRole.attachInlinePolicy(policy);
  return serviceRole;
};

const withEsQueryResolvers = (
  api: GraphqlApi,
  names: string[],
  target: environment.Environments,
  props: ApiProps
) => {
  const es = esDataSource(api, target, props);
  names.forEach((e) => {
    const res = new CfnResolver(api, e + "Resolver", {
      apiId: api.apiId,
      fieldName: e,
      typeName: "Query",
      dataSourceName: es.name,
      kind: "UNIT",
      requestMappingTemplate: MappingTemplate.fromFile(
        join(__dirname, "schema", "resolvers", "public", e + ".request.vtl")
      ).renderTemplate(),
      responseMappingTemplate: MappingTemplate.fromFile(
        join(__dirname, "schema", "resolvers", "public", e + ".response.vtl")
      ).renderTemplate(),
    });
    res.addDependsOn(es);
  });
};

const esDataSource = (
  api: GraphqlApi,
  target: environment.Environments,
  props: ApiProps
) => {
  const role = apiDefaultRole(api, target, props);
  return new CfnDataSource(api, "datasource-es", {
    apiId: api.apiId,
    name: "es",
    type: "AMAZON_ELASTICSEARCH",
    elasticsearchConfig: {
      awsRegion: "ap-northeast-1",
      endpoint: "https://" + props.esEndPoint,
    },
    serviceRoleArn: role.roleArn,
  });
};

const withLambdaQueryResolvers = (
  api: GraphqlApi,
  input: QueryResolverInput
) => {
  input.resolverNames.forEach((n) => {
    const f = new Function(input.stack, n, funcProps(n, n, input.target));
    f.addToRolePolicy(input.functionRole);
    api.addLambdaDataSource(n, f).createResolver(queryResolver(n));
  });
};

const defaultApiStatement = (props: ApiProps) => {
  return new IAM.PolicyStatement({
    effect: IAM.Effect.ALLOW,
    actions: ["es:*"],
    resources: [props.esArn + "/*"],
  });
};

const resolver = (typeName: string, fieldName: string) => {
  return {
    typeName: typeName,
    fieldName: fieldName,
    responseMappingTemplate: MappingTemplate.lambdaResult(),
  };
};

const queryResolver = (fieldName: string) => {
  return resolver("Query", fieldName);
};

const apiProps = (target: environment.Environments): GraphqlApiProps => {
  return {
    xrayEnabled: true,
    name: environment.withEnvPrefix(target, "GraphqlApi"),
    logConfig: {
      fieldLogLevel: FieldLogLevel.ALL,
      excludeVerboseContent: false,
    },
    schema: Schema.fromAsset(join(__dirname, "schema/schema.graphql")),
    authorizationConfig: {
      defaultAuthorization: {
        authorizationType: AuthorizationType.API_KEY,
        apiKeyConfig: {
          expires: cdk.Expiration.after(cdk.Duration.days(365)),
          description: "default",
        },
      },
    },
  };
};

const code = (dirname: string) => {
  return Code.fromAsset(
    resolve(__dirname, "functions", dirname, "bin", "main.zip")
  );
};

const funcProps = (
  funcName: string,
  dirname: string,
  target: environment.Environments
): FunctionProps => {
  return {
    functionName: environment.withEnvPrefix(target, funcName),
    code: code(dirname),
    handler: "bin/main",
    runtime: Runtime.GO_1_X,
    tracing: Tracing.ACTIVE,
  };
};
