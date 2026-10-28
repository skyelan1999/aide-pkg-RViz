# RViz Workbench v0.1.0 — Preview

First public preview of a browser-native, read-only ROS 1 / ROS 2 visualization plugin for Aide.

- Topic discovery and subscriptions; fixed-frame TF lookup with bracketed interpolation and simulated-clock rewind handling.
- LaserScan, bounded PointCloud2, occupancy maps, paths, odometry, common Marker primitives and JPEG/PNG compressed-image previews.
- Project URDF primitives and STL/OBJ resources through the authorized Aide source API; credential-free display configuration proposals.
- SSH forwarding through an explicitly configured backend OpenSSH alias, with strict host-key checking.
- Chinese/English UI, bounded preview memory and explicit frame/connection errors.

Local acceptance covered 18 automated tests, real Noetic and Humble publishers through rosbridge, and both paths through an isolated OpenSSH tunnel. Browser acceptance covered the 3D canvas, project URDF, synthetic display fixtures and a real Humble LaserScan. See `docs/ACCEPTANCE.zh-CN.md` for the exact evidence and untested combinations. GitHub CI separately repeats build/tests, including a temporary SSH fixture, on Node.js 18/22/24.

This is a preview, not the original Qt RViz. It does not load native RViz C++ display plugins, publish robot commands, import complete `.rviz` files, execute Xacro, automatically reuse Aide SSH credentials, or provide high-rate full-fidelity point-cloud transport. Windows/Safari user installation, external robot hardware and full Aide installation acceptance remain pending.

Install the plugin ZIP through Aide's plugin UI. The package is self-contained and does not require npm installation or bundle a ROS runtime. ROS/rosbridge and any SSH configuration must be supplied separately in the backend/robot environment. Requires a host with the source/workbench APIs used by the plugin and Node.js 18+.

Assets include the plugin ZIP, SHA256SUMS and a release proof binding package/source hashes to the release commit. This release does not deploy or alter any local Aide service.
