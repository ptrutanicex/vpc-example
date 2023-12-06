import * as aws from "@pulumi/aws";
import { RouteTable, Subnet } from "@pulumi/aws/ec2";
import { Output } from "@pulumi/pulumi";

const vpc = new aws.ec2.Vpc("petarVpc", {
  cidrBlock: "10.0.0.0/16",
  enableDnsHostnames: true,
  enableDnsSupport: true,
});

const availabilityZones = ["us-east-1a", "us-east-1b"];
const { publicSubnets, privateSubnets, isolatedSubnets } =
  creteSubnets(availabilityZones);

const { publicRouteTables, privateRouteTables } =
  createRouteTablesWithAssociations();

createInternetGatewayRoutes(publicRouteTables);
createNatGatewayRoutes(privateRouteTables);

function creteSubnets(availabilityZones: string[]) {
  const publicSubnets: Subnet[] = [];
  const privateSubnets: Subnet[] = [];
  const isolatedSubnets: Subnet[] = [];
  let subnetIpNumber = 0;

  availabilityZones.forEach((availabilityZone, index) => {
    const publicSubnet = new aws.ec2.Subnet(
      `publicSubnet-${index}`,
      {
        vpcId: vpc.id,
        cidrBlock: `10.0.${subnetIpNumber++}.0/24`,
        availabilityZone,
        mapPublicIpOnLaunch: true,
        tags: {
          Name: `Public-${index}`,
        },
      },
      {
        dependsOn: [vpc],
      }
    );

    const privateSubnet = new aws.ec2.Subnet(
      `privateSubnet-${index}`,
      {
        vpcId: vpc.id,
        cidrBlock: `10.0.${subnetIpNumber++}.0/24`,
        availabilityZone,
        mapPublicIpOnLaunch: false,
        tags: {
          Name: `Private-${index}`,
        },
      },
      {
        dependsOn: [vpc],
      }
    );

    const isolatedSubnet = new aws.ec2.Subnet(
      `isolatedSubnet-${index}`,
      {
        vpcId: vpc.id,
        cidrBlock: `10.0.${subnetIpNumber++}.0/24`,
        availabilityZone,
        mapPublicIpOnLaunch: false,
        tags: {
          Name: `Isolated-${index}`,
        },
      },
      {
        dependsOn: [vpc],
      }
    );

    publicSubnets.push(publicSubnet);
    privateSubnets.push(privateSubnet);
    isolatedSubnets.push(isolatedSubnet);
  });

  return { publicSubnets, privateSubnets, isolatedSubnets };
}

function createRouteTablesWithAssociations() {
  const publicRouteTables: RouteTable[] = [];
  const privateRouteTables: RouteTable[] = [];

  publicSubnets.forEach((publicSubnet, index) => {
    const publicRouteTable = new aws.ec2.RouteTable(
      `publicRouteTable-${index}`,
      {
        vpcId: vpc.id,
      },
      {
        dependsOn: [vpc],
      }
    );

    publicRouteTables.push(publicRouteTable);

    const publicSubnetRouteTableAssociation = new aws.ec2.RouteTableAssociation(
      `publicSubnetRouteTableAssociation-${index}`,
      {
        subnetId: publicSubnet.id,
        routeTableId: publicRouteTable.id,
      },
      {
        dependsOn: [publicSubnet, publicRouteTable],
      }
    );
  });

  privateSubnets.forEach((privateSubnet, index) => {
    const privateRouteTable = new aws.ec2.RouteTable(
      `privateRouteTable-${index}`,
      {
        vpcId: vpc.id,
      },
      {
        dependsOn: [vpc],
      }
    );

    privateRouteTables.push(privateRouteTable);

    const privateSubnetRouteTableAssociation =
      new aws.ec2.RouteTableAssociation(
        `privateSubnetRouteTableAssociation-${index}`,
        {
          subnetId: privateSubnet.id,
          routeTableId: privateRouteTable.id,
        },
        {
          dependsOn: [privateSubnet, privateRouteTable],
        }
      );
  });

  isolatedSubnets.forEach((isolatedSubnet, index) => {
    const isolatedRouteTable = new aws.ec2.RouteTable(
      `isolatedRouteTable-${index}`,
      {
        vpcId: vpc.id,
      },
      {
        dependsOn: [vpc],
      }
    );

    const isolatedSubnetRouteTableAssociation =
      new aws.ec2.RouteTableAssociation(
        `isolatedSubnetRouteTableAssociation-${index}`,
        {
          subnetId: isolatedSubnet.id,
          routeTableId: isolatedRouteTable.id,
        },
        {
          dependsOn: [isolatedSubnet, isolatedRouteTable],
        }
      );
  });

  return { publicRouteTables, privateRouteTables };
}

function createNatGateway(subnetId: Output<string>, index: number) {
  const eip = new aws.ec2.Eip(`eip-${index}`, {
    domain: "vpc",
  });

  const natGateway = new aws.ec2.NatGateway(`natGateway-${index}`, {
    subnetId,
    allocationId: eip.allocationId,
  });

  return natGateway;
}

function createInternetGatewayRoutes(routeTables: RouteTable[]) {
  const internetGateway = new aws.ec2.InternetGateway(
    "internetGateway",
    {
      vpcId: vpc.id,
    },
    {
      dependsOn: [vpc],
    }
  );

  routeTables.forEach((routeTable, index) => {
    const routeToInternetGateway = new aws.ec2.Route(
      `routeToInternetGateway-${index}`,
      {
        routeTableId: routeTable.id,
        destinationCidrBlock: "0.0.0.0/0",
        gatewayId: internetGateway.id,
      },
      {
        dependsOn: [routeTable, internetGateway],
      }
    );
  });
}

function createNatGatewayRoutes(routeTables: RouteTable[]) {
  routeTables.forEach((routeTable, index) => {
    const subnetId = privateSubnets[index].id;
    const natGateway = createNatGateway(subnetId, index);

    const routeToNatGateway = new aws.ec2.Route(
      `routeToNatGateway-${index}`,
      {
        routeTableId: routeTable.id,
        destinationCidrBlock: "0.0.0.0/0",
        natGatewayId: natGateway.id,
      },
      {
        dependsOn: [routeTable, natGateway],
      }
    );
  });
}

// Export the name of the vpc
export const vpcId = vpc.id;
