# Agent Note: Desktop market package proposals

Status: implemented

English | [中文](2026-09-10-desktop-market-proposals.zh.md)

## Problem

Independent plugin catalogs propose package installations, while Electron owns the Desktop profile and its running Host. The immutable application runtime cannot be replaced through a catalog request.

## Decision

The application renderer submits structured installation and removal proposals. Electron validates the owned top-level sender and payload, lists every source in a native confirmation, and rejects changes while tasks, application installation, or another market transaction are active. Source-development profiles reject mutations.

The [market transaction manager](../../../../apps/desktop/src/market-project.ts) stages external plugin metadata, dependencies and the user's patch after confirmed Host shutdown. It checks package-owned compatibility declarations and boots the staged profile before directory replacement. An activation journal and rollback directory support recovery; activation failure restores the original profile. Application runtime packages remain protected. Disabled bundles stay disabled unless explicitly selected for installation.

The `0.1.5-alpha.2` implementation used a preinstalled market seed. The `0.1.6-alpha.2` runtime does not consume that seed or its preinstalled map. Those native packaging and repair entry points reject newer releases; a compatible market release and a new native packaging workflow are required before restoring preinstallation.

## Alternatives considered

Giving the market direct filesystem or pnpm access would bypass staging and recovery. Retaining the old core-package project would conflict with the signed immutable runtime. Native confirmation and a separate external-plugin transaction retain the catalog integration without changing application package ownership.

## Consequences

Catalog content and dependency planning remain independently distributed. Accepted changes can restart the Host and reload the application. Compatibility declarations qualify only the releases they name; the legacy Mac checks do not establish compatibility with the new runtime. The shared Web Plugin Manager remains available through the upstream application.
