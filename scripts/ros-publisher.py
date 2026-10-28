"""Synthetic publishers for isolated ROS 1 / ROS 2 integration acceptance."""
import math
import sys
from sensor_msgs.msg import LaserScan
from geometry_msgs.msg import TransformStamped
from tf2_msgs.msg import TFMessage

ros = int(sys.argv[1])
if ros == 2:
    import rclpy
    from rclpy.node import Node
    rclpy.init()
    node = Node('aide_rviz_acceptance')
    scan_pub = node.create_publisher(LaserScan, '/rviz_acceptance/scan', 10)
    tf_pub = node.create_publisher(TFMessage, '/tf', 10)
    now = lambda: node.get_clock().now().to_msg()
else:
    import rospy
    rospy.init_node('aide_rviz_acceptance')
    scan_pub = rospy.Publisher('/rviz_acceptance/scan', LaserScan, queue_size=1)
    tf_pub = rospy.Publisher('/tf', TFMessage, queue_size=1)
    now = rospy.Time.now

def publish():
    scan = LaserScan()
    scan.header.frame_id = 'acceptance_laser'
    scan.header.stamp = now()
    scan.angle_min = -math.pi
    scan.angle_max = math.pi
    scan.angle_increment = math.pi / 180
    scan.range_min = 0.1
    scan.range_max = 10.0
    scan.ranges = [3.0 + 0.2 * math.sin(i / 10) for i in range(360)]
    tr = TransformStamped()
    tr.header.frame_id = 'map'
    tr.header.stamp = scan.header.stamp
    tr.child_frame_id = 'acceptance_laser'
    tr.transform.translation.x = 1.25
    tr.transform.translation.z = 0.4
    tr.transform.rotation.w = 1.0
    msg = TFMessage()
    msg.transforms = [tr]
    tf_pub.publish(msg)
    scan_pub.publish(scan)

if ros == 2:
    node.create_timer(0.1, publish)
    rclpy.spin(node)
else:
    rate = rospy.Rate(10)
    while not rospy.is_shutdown():
        publish()
        rate.sleep()
