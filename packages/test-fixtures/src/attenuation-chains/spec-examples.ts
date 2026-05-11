export interface AttenuationChainFixture {
  name: string;
  condition: string;
  previous: string;
  next: string;
  expected: boolean;
}

export const attenuationChainFixtures: AttenuationChainFixture[] = [
  {
    name: "services-subset",
    condition: "services",
    previous: "pokedex:0,proxy:0",
    next: "pokedex:0",
    expected: true,
  },
  {
    name: "services-superset",
    condition: "services",
    previous: "pokedex:0",
    next: "pokedex:0,proxy:0",
    expected: false,
  },
  {
    name: "capabilities-subset",
    condition: "pokedex_capabilities",
    previous: "read,write",
    next: "read",
    expected: true,
  },
  {
    name: "capabilities-superset",
    condition: "pokedex_capabilities",
    previous: "read",
    next: "read,write",
    expected: false,
  },
  {
    name: "valid-until-shortens",
    condition: "valid-until",
    previous: "2030-01-01T00:00:00.000Z",
    next: "2027-01-01T00:00:00.000Z",
    expected: true,
  },
  {
    name: "valid-until-extends",
    condition: "valid-until",
    previous: "2027-01-01T00:00:00.000Z",
    next: "2030-01-01T00:00:00.000Z",
    expected: false,
  },
  {
    name: "origin-subset",
    condition: "origin",
    previous: "https://a.example,https://b.example",
    next: "https://a.example",
    expected: true,
  },
  {
    name: "origin-superset",
    condition: "origin",
    previous: "https://a.example",
    next: "https://a.example,https://b.example",
    expected: false,
  },
  {
    name: "route-subset",
    condition: "route",
    previous: "/pokemon/*,/invoice/*",
    next: "/pokemon/*",
    expected: true,
  },
  {
    name: "route-superset",
    condition: "route",
    previous: "/pokemon/*",
    next: "/pokemon/*,/invoice/*",
    expected: false,
  },
];
