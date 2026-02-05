const _chai = require("chai");
const expect = _chai.expect;
const rewire = require("rewire");
const { mockClient } = require("aws-sdk-client-mock");
const { mockConfig } = require("./stubs");
const {
  IAMClient,
  GetRoleCommand,
  GetUserCommand
} = require("@aws-sdk/client-iam");

// Rewire
const iam = rewire("../src/iam");

// iam Tests
describe("src/iam", () => {
  let stubs = [];

  // Mock iam Client
  let iamMock;

  beforeEach(() => {
    // Mock client
    iamMock = mockClient(IAMClient);
    // Mock config
    const configRestore = iam.__set__("config", mockConfig);
    stubs.push({ restore: function () { return configRestore(); } });
  });

  afterEach(() => {
    // Reset mock
    iamMock.reset();
    stubs.forEach(stub => stub.restore());
  });

  // describeRole
  it("describes role", (done) => {
    const name = "iam-role-name";

    // assert and resolve GetRoleCommand
    iamMock.on(GetRoleCommand).callsFake(input => {
      // assert
      expect(input).to.eql({ RoleName: name });

      // resolve
      return { Role: { RoleName: name } };
    });

    iam.describeRole(name)
      .then(result => {
        expect(result).to.deep.equal({ Role: { RoleName: name } });
        done();
      })
      .catch(done);
  });

  // describeUser
  it("describes user", (done) => {
    const name = "iam-user-name";

    // assert and resolve GetRoleCommand
    iamMock.on(GetUserCommand).callsFake(input => {
      // assert
      expect(input).to.eql({ UserName: name });

      // resolve
      return { User: { UserName: name } };
    });

    iam.describeUser(name)
      .then(result => {
        expect(result).to.deep.equal({ User: { UserName: name } });
        done();
      })
      .catch(done);
  });

});