const _chai = require("chai");
const expect = _chai.expect;
const rewire = require("rewire");
const { mockClient } = require("aws-sdk-client-mock");
const { mockConfig } = require("./stubs");
const {
  LambdaClient,
  ListFunctionsCommand,
  UpdateFunctionCodeCommand,
  InvokeCommand
} = require('@aws-sdk/client-lambda');

// Rewire
const lambda = rewire("../src/lambda");

// lambda Tests
describe("src/lambda", () => {
  let stubs = [];

  // Mock lambda Client
  let lambdaMock;

  beforeEach(() => {
    // Mock client
    lambdaMock = mockClient(LambdaClient);
    // Mock config
    const configRestore = lambda.__set__("config", mockConfig);
    stubs.push({ restore: function () { return configRestore(); } });
  });

  afterEach(() => {
    // Reset mock
    lambdaMock.reset();
    stubs.forEach(stub => stub.restore());
  });

  // listFunctions
  it("lists functions", (done) => {
    const filter = "function-prefix";
    const continuationToken = "continuationToken";
    const expectedFunctions1 = [
      { FunctionName: `${filter}-expected-1` },
      { FunctionName: `${filter}-expected-2` },
    ];
    const expectedFunctions2 = [
      { FunctionName: `${filter}-expected-3` },
      { FunctionName: `${filter}-expected-4` },
    ];

    // assert and resolve ListFunctionsCommand
    lambdaMock.on(ListFunctionsCommand).callsFake(input => {
      // assert
      if (input.Marker) {
        // Should have continuation token
        expect(input).to.eql({ Marker: continuationToken });

        // Resolve with items and no continuation
        return {
          Functions: [
            { FunctionName: "filtered-out-3" },
            { FunctionName: "filtered-out-4" },
            ...expectedFunctions2
          ]
        };
      }

      // resolve with functions and continuation
      return {
        NextMarker: continuationToken,
        Functions: [
          { FunctionName: "filtered-out-1" },
          { FunctionName: "filtered-out-2" },
          ...expectedFunctions1
        ]
      };
    });

    // Expect continuation and expectedFunctions1
    lambda.listFunctions(filter)
      .then(results => {
        expect(Object.keys(results)).to.have.members(["NextMarker", "Functions"]);
        expect(results.NextMarker).to.eql(continuationToken);
        expect(results.Functions).to.eql(expectedFunctions1);
        // Expect continuation and expectedFunctions2
        return lambda.listFunctions(filter, continuationToken);
      })
      .then(results => {
        expect(Object.keys(results)).to.have.members(["Functions"]);
        expect(results.Functions).to.eql(expectedFunctions2);
        done();
      })
      .catch(done);
  });

  // updateFunctionCode
  it("updates function code", (done) => {
    const params = {
      FunctionName: "lambda-function"
    };
    const expected = {
      FunctionName: "lambda-function",
      Runtime: "nodejs",
      Handler: "handlers/lambda-function.handler"
    };

    lambdaMock.on(UpdateFunctionCodeCommand).callsFake(input => {
      expect(input).to.eql(params);
      return expected;
    });

    lambda.updateFunctionCode(params)
      .then(result => {
        expect(result).to.deep.equal(expected);
        done();
      })
      .catch(done);
  });

  // updateFunctionsCode
  it("updates all functions code", (done) => {
    const filter = "function-prefix";
    const continuationToken = "continuationToken";
    const expectedFunctions1 = [
      { FunctionName: `${filter}-expected-1` },
      { FunctionName: `${filter}-expected-2` },
    ];
    const expectedFunctions2 = [
      { FunctionName: `${filter}-expected-3` },
      { FunctionName: `${filter}-expected-4` },
    ];
    const params = {
      S3Bucket: "my-bucket",
      S3Key: "code-key",
      S3ObjectVersion: "1",
      Publish: true
    };

    // Mock list
    lambdaMock.on(ListFunctionsCommand).callsFake(input => {
      if (input.Marker) {
        return { Functions: expectedFunctions2 };
      }
      return { NextMarker: continuationToken, Functions: expectedFunctions1 };
    });

    // Mock update
    lambdaMock.on(UpdateFunctionCodeCommand).callsFake(input => {
      expect(Object.keys(input)).to.have.members(["FunctionName", "S3Bucket", "S3Key", "S3ObjectVersion", "Publish"]);
      expect(input.FunctionName).to.not.be.null;
      expect(input.S3Bucket).to.eql(params.S3Bucket);
      expect(input.S3Key).to.eql(params.S3Key);
      expect(input.S3ObjectVersion).to.eql(params.S3ObjectVersion);
      expect(input.Publish).to.eql(params.Publish);

      return {
        FunctionName: input.FunctionName,
        Runtime: "nodejs",
        Handler: `handlers/${input.FunctionName}.handler`
      };
    });

    lambda.updateFunctionsCode(filter, params)
      .then(() => done())
      .catch(done);
  });

  // invokeFunction
  it("invokes lambda function", (done) => {
    const expectedInputObj = {
      FunctionName: "lambda-function-object",
      Payload: {
        key_1: "value_1",
        key_2: "value_2",
      },
      ClientContext: {
        ctx_key_1: "ctx_value_1",
        ctx_key_2: "ctx_value_2",
      }
    };
    const expectedInputJson = {
      FunctionName: "lambda-function-json",
      Payload: JSON.stringify(expectedInputObj.Payload),
      ClientContext: {
        ctx_key_1: "ctx_value_1",
        ctx_key_2: "ctx_value_2",
      }
    };
    const expectedResponse = {
      StatusCode: 200,
      Payload: Buffer.from("{\"message\":\"success\"}"),
    };

    lambdaMock.on(InvokeCommand).callsFake(input => {
      expect(Object.keys(input)).to.have.members(["FunctionName", "Payload", "ClientContext"]);

      if (input.FunctionName.includes("json")) {
        expect(input).to.eql(expectedInputJson);
      } else {
        // Should be same but with stringified payload
        expect(input).to.eql({
          FunctionName: expectedInputObj.FunctionName,
          Payload: JSON.stringify(expectedInputObj.Payload),
          ClientContext: expectedInputObj.ClientContext
        });
      }

      return expectedResponse;
    });

    // Invoke with input object
    lambda.invokeFunction(expectedInputObj.FunctionName, expectedInputObj.Payload, expectedInputObj.ClientContext)
      .then(result => {
        expect(result).to.deep.equal(expectedResponse);
        // Invoke with input JSON string
        return lambda.invokeFunction(expectedInputJson.FunctionName, expectedInputJson.Payload, expectedInputJson.ClientContext);
      })
      .then(result => {
        expect(result).to.deep.equal(expectedResponse);
        done();
      })
      .catch(done);
  });

});