const _chai = require("chai");
const expect = _chai.expect;
const rewire = require("rewire");
const { mockClient } = require("aws-sdk-client-mock");
const { mockConfig } = require("./stubs");
const {
  SSMClient,
  PutParameterCommand,
  GetParametersCommand,
  DeleteParameterCommand
} = require('@aws-sdk/client-ssm');

// Rewire
const parameterStore = rewire("../src/parameterStore");

// Parameter Store Tests
describe("src/parameterStore", () => {
  let stubs = [];

  // Mock SSM Client
  let ssmMock;

  beforeEach(() => {
    // Mock client
    ssmMock = mockClient(SSMClient);
    // Mock config
    const configRestore = parameterStore.__set__("config", mockConfig);
    stubs.push({ restore: function () { return configRestore(); } });
  });

  afterEach(() => {
    // Reset mock
    ssmMock.reset();
    stubs.forEach(stub => stub.restore());
  });

  // Put Parameter
  it("puts parameter", (done) => {
    const param = {
      Name: "ssm-param-name",
      Value: "SOME_VALUE"
    };

    ssmMock.on(PutParameterCommand).callsFake(input => {
      expect(input).to.eql(param);
      return {};
    });

    parameterStore.putParameter(param)
      .then(result => {
        expect(result).to.deep.equal(param.Name);
        done();
      })
      .catch(done);
  });

  describe("get parameter", () => {
    // Get Parameter
    it("gets parameter", (done) => {
      const param = {
        Name: "ssm-param-name",
        Value: "SOME_VALUE"
      };

      ssmMock.on(GetParametersCommand).callsFake(input => {
        expect(input).to.eql({
          Names: [param.Name],
          WithDecryption: true
        });
        return { Parameters: [param] };
      });

      parameterStore.getParameter(param.Name)
        .then(result => {
          expect(result).to.deep.equal(param);
          done();
        })
        .catch(done);
    });

    // Parameter not found
    it("parameter not found", (done) => {
      const param = {
        Name: "ssm-param-name",
        Value: "SOME_VALUE"
      };

      ssmMock.on(GetParametersCommand)
        .resolvesOnce({ Parameters: [] })
        .resolvesOnce({});

      parameterStore.getParameter(param.Name)
        .then(() => done(new Error('Expected rejection')))
        .catch(err => {
          expect(err.message).to.equal("Parameter not found");
          return parameterStore.getParameter(param.Name);
        })
        .then(() => done(new Error('Expected rejection')))
        .catch(err => {
          expect(err.message).to.equal("Parameter not found");
          done();
        })
        .catch(done);
    });
  });

  // Check Parameter
  describe("check parameter", () => {

    // Finds parameter
    it("parameter found", (done) => {
      const param = {
        Name: "ssm-param-name",
        Value: "SOME_VALUE"
      };

      ssmMock.on(GetParametersCommand).callsFake(input => {
        expect(input).to.eql({ Names: [param.Name] });
        return { Parameters: [param] };
      });

      parameterStore.checkParameter(param.Name)
        .then(result => {
          expect(result).to.be.true;
          done();
        })
        .catch(done);
    });

    // Cannot find parameter
    it("parameter not found", (done) => {
      const param = {
        Name: "ssm-param-name",
        Value: "SOME_VALUE"
      };

      ssmMock.on(GetParametersCommand)
        .resolvesOnce({ Parameters: [] })
        .resolvesOnce({});

      parameterStore.checkParameter(param.Name)
        .then(res => {
          expect(res).to.be.false;
          return parameterStore.checkParameter(param.Name);
        })
        .then(res => {
          expect(res).to.be.false;
          done();
        })
        .catch(done);
    });
  });

  // Finds parameter
  it("deletes parameter", (done) => {
    const param = {
      Name: "ssm-param-name"
    };

    ssmMock.on(DeleteParameterCommand).callsFake(input => {
      expect(input).to.eql({ Name: param.Name });
      return {};
    });

    parameterStore.deleteParameter(param.Name)
      .then(result => {
        expect(result).to.deep.equal(param.Name);
        done();
      })
      .catch(done);
  });

});